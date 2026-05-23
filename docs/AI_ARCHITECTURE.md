# AI Intelligence Layer 重构指南

本指南详述了我们如何搭建符合企业级 SaaS 标准的 AI 智能分析层（`api/services/ai/`）。
该架构确保了**分析的结构化、确定性**，并将**安全红线**（绝不自动改动广告）放在首位。

## 1. 目录结构 (Directory Structure)

```text
api/services/ai/
├── context.builder.ts   # 数据拾取与组装中心 (Context Generator)
├── prompt.builder.ts    # System Prompts 生成器，负责业务指令编排
├── rules.engine.ts      # (第一道防线) Rule-based 异常统计引擎与基础分计算
└── ai.service.ts        # (核心) Gemini 访问门面，结合 Schema 格式化约束输出 JSON
```

## 2. 模块职责解析 (Module Responsibilities)

### 2.1 Rules Engine (静态规则引擎)

AI 具有不可解释性和极高成本，并非所有异常都需要 AI 介入。
`rules.engine.ts` 承担了“第一道防线”的作用：

- **纯数学推断**: 秒级发现诸如 ROAS < 1.0 (致命亏损)、CPM 暴涨 > 50%、CTR 极低等强异常信号。
- **基准分计算 (Health Scoring)**: 赋予账号基础分 (Base Score)，满分 100 往下扣除。
- 只有触发了重度异常，或者到了每日体检时间，系统才会将计算出的 `RuleAnomaly` 抛给 Gemini 分析更深层次的原因。

### 2.2 Context Builder (上下文构建)

大语言模型无法直接连接数据库。

- `buildDiagnosticContext`: 从 `InsightRepository` 取出过去 14 天的完整趋势数据，并转换成高度致密的 Markdown 表格流（LLM 极其擅长阅读二维表格并推导时序波动）。
- 拒绝向 LLM 提供不相关的无关噪音数据，严格把控 Tokens 的有效命中率。

### 2.3 Prompt Builder

使用极度克制、冷酷的指令。

- 绝不允许“自动操作账户”的提示词出现。
- 明确划分系统边界：**AI 是军师，用户是主帅**。

### 2.4 AI Service (Gemini API Orchestration)

完全摒弃原有的松散的 Markdown Stream。前端直接渲染 Markdown 会让"将 AI 建议转化为可点击跟进的待办行动 (To-Do/Action Items)" 成为不可能。

- 引入 `@google/genai` 并在 `config` 中指定 `responseMimeType: "application/json"` 和 `responseSchema`。
- 强制 Gemini 吐出如下标准结构的 JSON：
  - `aiAdjustedScore`: AI 修正评分。
  - `fatigueStatus`: 素材与受众疲劳检测标识 (Boolean)。
  - `actionableSuggestions`: `[{ title, description, priority }]` 格式的高可读性人类待办指令。

## 3. 分析诊断全流程 (The AI Flow)

1. **Trigger (触发)**: 每日定时任务或用户控制台点击“立即体检”。
2. **Context (提纯)**: 提取过去 14 天花费、转化、流量漏斗指标。
3. **Rule Scan (初筛)**: 计算出基数分(70/100)并找出 "CPM 飙升" 等明显风险点。
4. **LLM Chain (推理)**: Gemini 1.5/2.5 系列根据 Prompt 和二维表时序进行交叉分析（如：虽然今天 ROAS 达标，但 ATC 连续下降且 CPC 稳步抬头，这预示着明天即将崩盘）。
5. **Enforce JSON (铸模)**: LLM 原生输出 JSON 被强行映射进 TypeScript 结构中。
6. **Persistence (落地)**: 该 JSON 后续可无缝保存进数据库供 Dashboard 渲染“诊断历史”、“未读风险通知”、“AI 操作建议卡片”。

## 4. 商业价值观与合规设计

- **Audit Logging (审计系统筹备)**: 由于结构化输出了 `actionableSuggestions`。前端可以展现为 Checkbox 列表。投放师看完后点击“已应用更改”，系统在此刻记入一条审计日志："投放师 A 于 10:05 确认采纳了《刷新受众层级》建议"。
- **可解释性**: `fatigueStatus.reasoning` 字段提供了分析依据，避免“黑盒 AI”带来的信任危机。
