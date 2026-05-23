# Frontend Intelligence Dashboard 架构指南

本指南详述了如何构建“AI 广告智能运营中心”（AI Ads Intelligence Dashboard），坚决摒弃传统的 Chat UI 模式，转向更为专业、高效的**工单驱动与仪表盘驱动**的企业级视窗。

## 1. 前端目录结构 (Frontend Directory Structure)

```text
src/
├── components/
│   ├── intelligence/               # AI 智能面板核心组件群
│   │   ├── HealthScorecard.tsx     # 广告健康综合评分环形图
│   │   ├── AiSuggestionCard.tsx    # AI 生成的操作建议卡片 (To-Do list)
│   │   ├── FatigueMonitor.tsx      # 素材/受众疲劳度监控 (雷达图/进度条)
│   │   └── SpendRiskPanel.tsx      # 极端消耗（跑爆）预警监控
│   ├── charts/                     # Recharts 图表封装
│   │   ├── RoasTrendChart.tsx      # 时序 ROAS 预测折线图
│   │   └── CpaVolatilityChart.tsx  # CPA 波动散点/面积图
│   └── tickets/                    # 智能工单系统
│       ├── AnomalyTicketList.tsx   # 风险预警工单列表
│       └── TicketDetailDrawer.tsx  # 工单详情（含审批、应用、拒绝流）
├── pages/
│   └── IntelligenceDesk.tsx        # 核心入口页面
├── store/
│   └── useIntelligenceStore.ts     # Zustand 状态管理 (Local & UI Filters)
└── hooks/
    ├── useDiagnosticQuery.ts       # React Query 封装 (HTTP GET & Polling)
    └── useWebSocketSink.ts         # WebSocket 监听器 (监听 BullMQ 完成事件)
```

## 2. 页面架构与布局 (Dashboard Layout - SaaS Style)

采用经典 SaaS 的大宽屏 Bento-Grid 结构（CSS Grid），而非瀑布流或对话流。

- **Top Bar (顶栏)**: 账户切换下拉框 (Account Selector)、全局时间选择器 (Date Range 7/14/30d)、全局同步状态指示灯 (Sync Status: Idle/Syncing)。
- **Left Sidebar (侧边栏)**: 功能导航（大盘数据、诊断中心、素材库、系统设置）。
- **Main Area (主显示区)** (Bento Grid):
  - `Grid-1 (Top-Left, 2 columns)`: **Ad Health Scorecard** (70/100) 及雷达图展示各项健康维度。
  - `Grid-2 (Top-Right, 1 column)`: **Spend Risk Monitor** 展示今日剩余配额及花爆预警进度条。
  - `Grid-3 (Middle, 3 columns)`: **Trend Analysis Charts (Recharts)** (ROAS/CPA 连日折线与移动平均线)，辅以渐变背景，体现趋势感知。
  - `Grid-4 (Bottom, Full Width)`: **AI Anomaly Tickets** (异常工单面板)。由 AI 自动生成的事项处理列表。

## 3. 核心机制设计

### 3.1 AI 异常工单系统 (Anomaly Tickets) 与 AI 操作确认流

坚守**“人机隔离”**红线。AI 没有操作权。

- **Ticket 结构**: AI 发现的每个异常（如 "US受众组CPA飙升"）生成一个 Ticket。
- **可执行建议 (Actionables)**: 每个 Ticket 内嵌 AI 生成的操作项。
- **操作确认流**: 点击 [采纳建议] 按钮，会弹出一个 Confirmation Dialog 展示将要发生的 Prisma/Meta 修改，投流师点击 [确认授权]，前端才请求执行接口并产生一条 Audit Log。

### 3.2 数据层流转架构 (React Query + Zustand)

- **React Query (`@tanstack/react-query`)**: 绝佳的 Server State 同步工具。管理历史图表数据、风险工单列表。配置 `staleTime: 5 * 60 * 1000` (5分钟) 和失焦重新拉取 (`refetchOnWindowFocus`).
- **Zustand**: 管理 UI 的临时状态，例如当前选中的广告账户 ID (`selectedAccountId`)，弹窗是否打开 (`isTicketDrawerOpen`)。

### 3.3 实时更新与异步唤醒 (WebSocket / Webhooks)

- 配合后端 BullMQ 架构。点击“重新体检”后，HTTP 请求只返回 `202 Accepted` 和 `jobId`。
- 前端通过 `useWebSocketSink` 监听 `ws:ai:{accountId}`。
- 收到 `DIAGNOSIS_COMPLETED` 消息后，调用 React Query 的 `queryClient.invalidateQueries(['diagnoses', accountId])`，UI 会瞬间无缝刷出最新评估数据，骨架屏 (Skeleton) 消失。

### 3.4 骨架与加载流 (Loading & Skeleton)

- 不能用简单的 "Spinner"，企业级系统应使用 **Skeleton 组件** (来自 shadcn/ui)。
- AI 诊断这种长达 5-15 秒的任务，可以配合“极客式”步骤加载语，如: "分析近日 ROAS...", "构建疲劳度数学模型...", "Gemini 生成策略中..." 以缓解等待焦虑。
