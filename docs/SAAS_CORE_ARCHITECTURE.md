# Multi-Tenant SaaS Core Architecture

本指南详述了我们如何将系统从单体架构（Single-Tenant）平滑升级为真正的企业级多租户 SaaS 架构（Multi-Tenant）。

## 1. 核心模型设计 (Core Data Model)

采用了 `Organization -> Workspace -> Resource` 的三层隔离模型：

- **Organization (组织/公司)**: SaaS 的计费实体（Billing Entity）。挂载 Plan/Subscription 等计费信息。
- **Workspace (工作区)**: 业务隔离实体。一个组织可以拥有多个 Workspace（例如：针对不同市场或品牌的隔离环境）。`ShopifyStore` 和 `AdAccount` 挂载在 Workspace 下。
- **User (用户)**: 用户可以被邀请加入不同组织，并在每个组织/工作区中担任不同角色。

## 2. 权限与角色 (RBAC - Role Based Access Control)

为了满足严苛的权限审计需求，我们实现了双层权限：

### 2.1 组织层角色 (OrgRole)

- **OWNER**: 组织创建者（拥有财务、计费、最高权限）
- **ADMIN**: 组织管理员（允许邀请成员）
- **MEMBER**: 普通成员
- **VIEWER**: 仅读权限

### 2.2 工作区层角色 (WorkspaceRole)

- **ADMIN**: 工作区管理员（允许增删改 Store/AdAccount）
- **OPERATOR**: 投放师/运营操作员（允许查看数据、执行 AI 分析优化）
- **VIEWER**: 仅查看数据大盘

## 3. 安全隔离中间件 (Isolation Middleware)

`rbac.middleware.ts` 提供拦截器：

- `requireWorkspaceRole(role)`: 校验当前请求中的 API Token 是否对特定的 `workspaceId` 具备所需权限。如果不具备，报 `403 Forbidden`。
- 这是企业级 SaaS 最关键的安全基石，防止“越权访问” (BOLA / IDOR 漏洞)。

## 4. 审计日志 (Audit Logs)

所有**破坏性操作**或**由 AI 触发的账目操作**均强行记录至 `AuditLog`。

- 保证用户可以追溯："User X 于 10:00 接受了 AI 建议，更改了 AdAccount Y 的日预算"。
- 给未来构建基于合规性（Compliance）的高级 SaaS 版本（如 Enterprise 报表）打下基础。

## 5. 计费与用量 (Billing & Usage Metering)

- **Subscription Tier**: `plan` 字段（FREE, PRO, ENTERPRISE）。
- **Usage Tracking**: 后续在使用 AI 建议或同步 Meta 数据时，会在 `usage.service.ts` 里更新并校验组织余额（每月额度）。如果是 `FREE` 用户，调用次数耗尽时报 `402 Payment Required`。

...
