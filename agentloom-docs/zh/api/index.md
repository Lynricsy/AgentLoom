---
aside: false
outline: false
title: API 参考
---

AgentLoom 平台 REST API 完整参考文档，基于 OpenAPI 3.0 规范自动生成。

## Generated App 端到端接入

Generated App API 适合把“一句话生成应用”接入 Studio 之外的前端、小程序或自有业务系统。创建者管理接口使用常规 `/api/v1` 认证链路：`Authorization: Bearer <JWT>` 或 `X-Api-Key: <API Key>`，并且请求用户必须拥有当前租户下允许的角色。创建、启动生成、公开分享和删除提交通常需要 `owner`、`admin` 或 `creator`；列表、详情和审阅类接口可按服务端角色策略开放给只读角色。

公开 runtime 与公开提交接口不同：终端用户只需要拿到不可猜测的 public token 链接，不需要登录，也不能访问创建者管理接口。public token 只用于 URL 路由和 API 查询，不应在页面正文、日志、埋点或错误提示中展示。公开 token 关闭或重新生成后，旧 token 立即失效，旧 token 下的提交详情也不能再通过新 token 读取。

### 调用流程

1. 调用 `POST /generated-apps`，用 `{ prompt }` 创建应用。
2. 调用 `POST /generated-apps/:appId/generation-runs/start`，启动自动生成与 Gate 0-7 校验。
3. 当返回的 `app.readiness.state === "publish_candidate"` 且 `app.readiness.canCreatePublicShare === true` 时，调用 `POST /generated-apps/:appId/public-share` 启用公开链接。
4. 终端用户访问 `GET /generated-apps/public/:token`，读取 `runtimeForm`，按 `runtimeForm.fields` 动态渲染输入控件。
5. 终端用户提交 `POST /generated-apps/public/:token/submissions`，最小请求体为 `{ input }`；也可传入 `anonymousSessionId`，但它只是匿名会话标识，不能作为认证或授权依据。
6. 使用 `GET /generated-apps/public/:token/submissions/:submissionId` 查询报告状态、`result`、`report` 和 `errorMessage`，并把 `report.sections`、下一步问题、追问提示、异步 Workflow 执行状态和免责声明渲染成终端用户可读内容。如果 `result` 或 `report` 表示 `workflowExecution=true` 且 `executionStatus` 为 `pending`、`running` 或 `paused`，终端前端可以按 2 秒左右的间隔轮询这个 public submission detail 接口；`completed`、`failed`、`cancelled`、`workflowExecution=false` 或没有 handoff 字段时应停止轮询。
7. 创建者在登录态使用 `GET /generated-apps/:appId/submissions`、`GET /generated-apps/:appId/submissions/:submissionId`、`DELETE /generated-apps/:appId/submissions/:submissionId` 或 `POST /generated-apps/:appId/submissions/delete` 管理公开提交。

### TypeScript fetch 示例

```ts
const apiBase = "https://agentloom.ling.plus/api/v1";
const creatorHeaders = {
  Authorization: `Bearer ${creatorJwt}`,
  "Content-Type": "application/json",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

const app = await api<{ id: string }>("/generated-apps", {
  method: "POST",
  headers: creatorHeaders,
  body: JSON.stringify({ prompt: "自动化中医问诊信息整理系统" }),
});

const run = await api<{
  app: {
    id: string;
    readiness: { state: string; canCreatePublicShare: boolean };
  };
}>(`/generated-apps/${app.id}/generation-runs/start`, {
  method: "POST",
  headers: creatorHeaders,
  body: JSON.stringify({ triggerSource: "initial" }),
});

if (
  run.app.readiness.state !== "publish_candidate" ||
  !run.app.readiness.canCreatePublicShare
) {
  throw new Error("应用尚未通过发布门禁，不能启用公开链接。");
}

const shared = await api<{ publicShareUrl: string }>(
  `/generated-apps/${app.id}/public-share`,
  { method: "POST", headers: creatorHeaders },
);

const token = new URL(shared.publicShareUrl).pathname.split("/").pop()!;
const runtime = await api<{
  runtimeForm: {
    fields: Array<{ id: string; label: string; type: string; required: boolean }>;
  };
}>(`/generated-apps/public/${encodeURIComponent(token)}`);

const input = Object.fromEntries(
  runtime.runtimeForm.fields.map((field) => [
    field.id,
    field.required ? `示例：${field.label}` : "",
  ]),
);

const submission = await api<{ id: string }>(
  `/generated-apps/public/${encodeURIComponent(token)}/submissions`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  },
);

const detail = await api<{
  status: string;
  report: {
    sections?: Array<{ title?: string; body?: string; items?: string[] }>;
    nextStepQuestions?: string[];
    followUpPrompts?: string[];
    disclaimers?: string[];
  } | null;
  errorMessage: string | null;
}>(
  `/generated-apps/public/${encodeURIComponent(
    token,
  )}/submissions/${submission.id}`,
);

if (detail.status === "failed") {
  renderError(detail.errorMessage ?? "提交处理失败，请调整输入后重试。");
} else {
  renderPublicReport(detail.report);
}
```

### 第三方前端轮询状态机

第三方前端不需要也不应该调用登录态 execution 调试接口来读取公开提交状态。公开 runtime 的状态机只依赖 public submission detail 响应：

| 条件 | 终端前端行为 |
| --- | --- |
| `workflowExecution` 缺失 | 展示本地确定性 `report`，停止轮询 |
| `workflowExecution=false` | 展示本地确定性 `report` 与 `workflowExecutionNotice`，停止轮询 |
| `workflowExecution=true` 且 `executionStatus=pending/running/paused` | 展示“正在执行”状态，保留本地报告 fallback，继续轮询 public submission detail |
| `workflowExecution=true` 且 `executionStatus=completed` | 展示本地报告、Workflow 状态段和 `workflowExecutionSummary`，停止轮询 |
| `workflowExecution=true` 且 `executionStatus=failed/cancelled` | 展示本地报告 fallback 和安全失败/取消提示，停止轮询 |

公开 submission 的 `status` 会随 handoff 刷新而变化：`pending` 映射为 `received`，`running/paused` 映射为 `running`，`completed` 映射为 `completed`，`failed/cancelled` 映射为 `failed`。前端可以用顶层 `status` 做列表 badge，但是否继续轮询应优先读取 `result` 或 `report` 中的 handoff 字段。

### 公开响应边界

公开 runtime 响应只应作为终端用户业务界面使用。API 响应可能包含 `token` 以便客户端缓存或调试，但公开页面不得渲染或记录 token 值。终端页面可展示的数据应限制在 `appId`、`title`、`description`、`dataUseNotice`、有限的 `appSpec`、`runtimeSurface.previewUrl`、`runtimeForm` 和 `createdAt`。其中 `runtimeForm` 只暴露 `formId`、`title`、`description`、`submitLabel`、`sections[]`、`fields[]`、`resultView` 以及字段的 `id`、`label`、`type`、`required`、`placeholder`、`helpText`、`options`、`min`、`max`、`step`。

公开页面和第三方终端前端禁止展示或记录内部字段：`gateResults`、`readiness`、`generationPlan`、`sourceArtifactUrl`、`testReportUrl`、`pluginIds`、`publicShareToken`、宿主机路径和 `secrets`。公开提交响应也不能暴露租户 ID、公开 token、门禁证据、源码/测试 artifact、插件内部信息或创建者专用字段。

公开提交详情只应使用 public submission 响应：`id`、`appId`、`appSpecVersion`、`status`、`anonymousSessionId`、`input`、`result`、`report`、`errorMessage`、`createdAt` 和 `updatedAt`。当绑定的 Workflow 已发布时，`result` / `report` 还可能包含 `workflowExecution`、`executionId`、`executionStatus`、`workflowDefinitionId`、`executionBoundary`、`workflowExecutionNotStartedReason`、`workflowExecutionNotice`、`workflowExecutionUpdatedAt`、`workflowExecutionCompletedAt` 和 `workflowExecutionSummary`。这些字段只表示公开 submission 对异步 Workflow execution 的安全 handoff 和轮询状态；公开端不能调用登录态 `GET /executions/:id`，也不能读取 execution steps、node data、checkpoint data、tool calls、definition snapshot、stack、token、路径或内部 `_meta`。即使历史或异常存量 `result` / `report` 中曾写入 `definitionSnapshot`、`inputParams._meta`、`nodeData`、`checkpointData`、`toolCalls`、`sourceArtifactUrl`、`testReportUrl`、token、secret、authorization 或宿主机路径，公开响应也应先移除或脱敏这些内部内容。`result` / `report` 不能直接作为内部 JSON dump 展示；终端页面应只渲染结构化报告段落、下一步问题、追问提示、异步执行状态/边界说明、安全摘要和免责声明，并过滤 `runtimeKind`、`contractSummary`、token、readiness、门禁证据、artifact URL、插件 ID 和创建者专用字段。

### 当前 runtime 边界

public submission 会先生成本地确定性报告：服务端会基于 `appSpec`、安全的 public runtime contract 摘要和清洗后的 `input` 同步生成 `result` / `report`，不会伪装为真实 AI、生产沙箱或插件执行。当 Generated App 绑定的是同租户已发布 Workflow 且存在 `publishedVersionId` 时，服务端会通过执行服务创建一个异步 Workflow execution，并在公开报告中只展示 execution id、status 与 boundary；创建响应不会等待 execution 完成，也不会伪造最终 Workflow 输出。Gate 7 real-local 通过后，服务端会创建或复用同租户已发布的 Generated App runtime Workflow，并把它写入 `workflowDefinitionId`，因此创建者显式启用公开分享后，公开提交默认可以走异步 execution handoff。之后 `GET /generated-apps/public/:token/submissions/:submissionId` 会在当前应用租户范围内做最小安全查询并刷新 handoff 状态：`pending/running/paused` 表示仍在执行，`completed` 表示执行已完成但公开端只展示安全摘要，`failed/cancelled` 表示执行未完成并继续保留 deterministic report fallback。若 execution 不存在、跨租户、Workflow 不匹配或查询失败，公开响应会安全降级为不可用 handoff，不暴露内部错误。历史或手动绑定的 editor handoff draft 仍只用于创建者在专业编辑器中继续精修，公开提交不会执行这类 draft；未发布、不可见或被治理阻止的 Workflow 会回退到本地 deterministic report 并显示安全的未启动原因。医疗、问诊或中医类应用只能做信息整理、下一步问题和免责声明，不能输出诊断、处方、剂量、治疗指令或专业医疗建议。

## 完整 OpenAPI 规范

<OASpec />
