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
5. 如果 `runtimeSurface.previewUrl` 存在，可把它作为“打开运行预览”链接展示。Gate 3 构建产物可用时，该链接通常指向 `GET /generated-apps/public/:token/preview`，它只返回 `dist/index.html` 的公开 HTML 预览，不返回源码、测试报告、artifact 清单或 workspace 路径。
6. 终端用户提交 `POST /generated-apps/public/:token/submissions`，最小请求体为 `{ input }`；也可传入 `anonymousSessionId`，但它只是匿名会话标识，不能作为认证或授权依据。
7. 使用 `GET /generated-apps/public/:token/submissions/:submissionId` 查询报告状态、`result`、`report` 和 `errorMessage`，并把 `report.sections`、下一步问题、追问提示、异步 Workflow 执行状态和免责声明渲染成终端用户可读内容。如果 `result` 或 `report` 表示 `workflowExecution=true` 且 `executionStatus` 为 `pending`、`running` 或 `paused`，终端前端可以按 2 秒左右的间隔轮询这个 public submission detail 接口；`completed`、`failed`、`cancelled`、`workflowExecution=false` 或没有 handoff 字段时应停止轮询。
8. 创建者在登录态使用 `GET /generated-apps/:appId/submissions`、`GET /generated-apps/:appId/submissions/:submissionId`、`DELETE /generated-apps/:appId/submissions/:submissionId` 或 `POST /generated-apps/:appId/submissions/delete` 管理公开提交；创建者提交列表会刷新当前页仍处于 `pending`、`running` 或 `paused` 的异步 Workflow handoff，并返回已持久化的安全状态。

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

公开 submission 的 `status` 会随 handoff 刷新而变化并持久化到提交记录：`pending` 映射为 `received`，`running/paused` 映射为 `running`，`completed` 映射为 `completed`，`failed/cancelled` 映射为 `failed`。如果已经创建过 handoff 但 execution 不存在、跨租户、Workflow 不匹配或查询失败，服务端会把记录安全降级为 `failed`、`workflowExecution=false`，并保留本地确定性报告 fallback。前端可以用顶层 `status` 做列表 badge，但是否继续轮询应优先读取 `result` 或 `report` 中的 handoff 字段。

### 公开响应边界

公开 runtime 响应只应作为终端用户业务界面使用。API 响应可能包含 `token` 以便客户端缓存或调试，但公开页面不得渲染或记录 token 值。终端页面可展示的数据应限制在 `appId`、`title`、`description`、`dataUseNotice`、有限的 `appSpec`、`runtimeSurface.previewUrl`、`runtimeForm` 和 `createdAt`。其中 `runtimeForm` 只暴露 `formId`、`title`、`description`、`submitLabel`、`sections[]`、`fields[]`、`resultView` 以及字段的 `id`、`label`、`type`、`required`、`placeholder`、`helpText`、`options`、`min`、`max`、`step`。第三方前端必须把 `runtimeForm.fields[]` 视为完整输入字段集合；`runtimeForm.sections[].fieldIds` 只用于分组布局。若某个字段没有被任何 section 引用，前端仍应在类似“其他信息”的兜底分组中渲染它，并让它正常参与必填校验和提交。

`runtimeSurface.previewUrl` 只用于可选运行预览链接。Gate 3 build output 可读时，服务端会返回 `/api/v1/generated-apps/public/:token/preview` 形式的公开预览端点；该端点返回 `text/html`，内容只来自受控 workspace 中 allowlist 的 `gate-3-build-output-html` / `dist/index.html`。当这个 HTML 通过公开预览路径打开时，它会从路径解析 token，并且只能调用同源 public submission API 来创建提交、读取提交详情和轮询异步 Workflow handoff 状态；如果不在公开预览路径下、无法解析 token 或 public submission API 不可用，它会退回本地 deterministic 预览，不会写入公开提交记录。第三方前端可以直接打开这个链接，但不应把它当作 artifact API：公开预览端点不会返回 artifact manifest、源码文件、测试报告、插件信息、Gate 证据、workspace metadata 或 host 绝对路径，也不会允许外部网络连接。

如果 AppSpec 需要问诊、评分、校验、风险筛查、逐步追问、工具或 API 型处理，生成链路可能会在创建者租户内生成并激活 tenant-private 插件工具。该插件资源只属于创建者租户，Gate 3 创建者 artifact manifest 可能列出插件 manifest、节点定义、源码、smoke fixture、build report 和二进制 `.alp` bundle；其中 `.alp` 只作为物化 bundle artifact，不会通过 artifact content 接口 inline 返回。公开 runtime、公开预览 HTML、公开 submission 响应和第三方终端前端都不能展示插件 ID、插件 manifest、build report、源码、bundle 路径、签名材料或激活 metadata，也不能把这些字段当成可调用的 public API surface。

公开页面和第三方终端前端禁止展示或记录内部字段：`gateResults`、`readiness`、`generationPlan`、`sourceArtifactUrl`、`testReportUrl`、`pluginIds`、`publicShareToken`、宿主机路径和 `secrets`。公开提交响应也不能暴露租户 ID、公开 token、门禁证据、源码/测试 artifact、插件内部信息或创建者专用字段。

公开提交详情只应使用 public submission 响应：`id`、`appId`、`appSpecVersion`、`status`、`anonymousSessionId`、`input`、`result`、`report`、`errorMessage`、`createdAt` 和 `updatedAt`。当绑定的 Workflow 已发布时，`result` / `report` 还可能包含 `workflowExecution`、`executionId`、`executionStatus`、`workflowDefinitionId`、`executionBoundary`、`workflowExecutionNotStartedReason`、`workflowExecutionNotice`、`workflowExecutionUpdatedAt`、`workflowExecutionCompletedAt` 和 `workflowExecutionSummary`。这些字段只表示公开 submission 对异步 Workflow execution 的安全 handoff 和轮询状态；公开端不能调用登录态 `GET /executions/:id`，也不能读取 execution steps、node data、checkpoint data、tool calls、definition snapshot、stack、token、路径或内部 `_meta`。即使历史或异常存量 `result` / `report` 中曾写入 `definitionSnapshot`、`inputParams._meta`、`nodeData`、`checkpointData`、`toolCalls`、`sourceArtifactUrl`、`testReportUrl`、token、secret、authorization 或宿主机路径，公开响应也应先移除或脱敏这些内部内容。`result` / `report` 不能直接作为内部 JSON dump 展示；终端页面应只渲染结构化报告段落、下一步问题、追问提示、异步执行状态/边界说明、安全摘要和免责声明，并过滤 `runtimeKind`、`contractSummary`、token、readiness、门禁证据、artifact URL、插件 ID 和创建者专用字段。

### 当前 runtime 边界

public submission 会先生成本地确定性报告：服务端会基于 `appSpec`、安全的 public runtime contract 摘要和清洗后的 `input` 同步生成 `result` / `report`，不会伪装为真实 AI、生产沙箱或插件执行。当 Generated App 绑定的是同租户已发布 Workflow 且存在 `publishedVersionId` 时，服务端会通过执行服务创建一个异步 Workflow execution，并在公开报告中只展示 execution id、status 与 boundary；创建响应不会等待 execution 完成，也不会伪造最终 Workflow 输出。Gate 7 real-local 通过后，服务端会创建或复用同租户已发布的 Generated App runtime Workflow，并把它写入 `workflowDefinitionId`；如果应用规划了租户私有 generated plugin tool，这个 Workflow 会包含对应 `plugin` 节点，公开提交触发的异步 execution 会在服务端执行该节点，但公开响应仍不暴露 plugin id、manifest、bundle、源码或内部 step 输出。之后 `GET /generated-apps/public/:token/submissions/:submissionId` 会在当前应用租户范围内做最小安全查询、刷新 handoff 状态，并把脱敏后的安全 handoff 字段持久化回提交记录：`pending/running/paused` 表示仍在执行，`completed` 表示执行已完成但公开端只展示安全摘要，`failed/cancelled` 表示执行未完成并继续保留 deterministic report fallback。创建者提交详情使用同一套安全刷新规则，并验证 execution `_meta` 与提交记录匹配；创建者提交列表只刷新当前页中未终止的 handoff 行。若 execution 不存在、跨租户、Workflow 不匹配或查询失败，公开响应会安全降级为不可用 handoff，将记录状态收敛为 `failed`，且不暴露内部错误。历史或手动绑定的 editor handoff draft 仍只用于创建者在专业编辑器中继续精修，公开提交不会执行这类 draft；未发布、不可见或被治理阻止的 Workflow 会回退到本地 deterministic report 并显示安全的未启动原因。医疗、问诊或中医类应用只能做信息整理、下一步问题和免责声明，不能输出诊断、处方、剂量、治疗指令或专业医疗建议。

## 完整 OpenAPI 规范

<OASpec />
