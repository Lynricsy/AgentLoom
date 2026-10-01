---
docType: howto
---

# 在自己的前端接入生成应用

把「一句话生成应用」做出来的应用放进 Studio 之外的前端、小程序或业务系统：创建者用登录态接口生成并公开应用，终端用户通过公开链接填写表单、提交并查看报告。Studio 里的操作流程见 [生成应用](/guide/generated-apps/)。

::: warning 未在本轮验证
本页的 TypeScript 示例没有端到端实跑：完整生成需要模型与沙箱运行时，本地验证只覆盖了创建应用与下文列出的错误响应。
:::

## 两类接口

| 接口 | 前缀 | 鉴权 | 角色 |
| --- | --- | --- | --- |
| 创建者管理 | `/api/v1/generated-apps` | JWT 或平台 API Token，见 [凭证](/api/#凭证) | 创建、启动生成、开关公开链接、删除提交：`owner`、`admin`、`creator`；只读接口另开放给 `operator`、`viewer`；删除应用：`owner`、`admin` |
| 公开运行时 | `/api/v1/generated-apps/public/:token` | 无，凭公开 token 访问 | — |

公开 token 不可猜测，关闭或重新生成后旧 token 立即失效，旧 token 下的提交也不能再通过新 token 读取。不要在页面正文、日志、埋点或错误提示里输出 token。

## 调用流程

1. `POST /generated-apps`，请求体 `{ "prompt": "…" }`（1–4000 字符）创建应用。
2. `POST /generated-apps/:appId/generation-runs/start` 启动生成与门禁校验。
3. 当 `app.readiness.state === "publish_candidate"` 且 `app.readiness.canCreatePublicShare === true` 时，`POST /generated-apps/:appId/public-share` 开启公开链接，响应中的 `publicShareUrl` 末段即公开 token。未达到条件时返回 409：

   ```text
   {"type":"https://agentloom.dev/errors/generated-app-public-share-not-ready","title":"生成应用尚不可发布","status":409,"detail":"生成应用 01a0f6e5-6c69-7e2d-8405-d64ef9eca972 尚未满足正式公开链接门槛：阻断门禁尚未全部通过，当前生成结果只能作为创建者预览或开发中试运行。","instance":"/api/v1/generated-apps/01a0f6e5-6c69-7e2d-8405-d64ef9eca972/public-share"}
   ```

4. 终端用户的页面调用 `GET /generated-apps/public/:token`，按 `runtimeForm.fields` 渲染输入控件。token 无效时返回 404 `generated-app-not-found`。
5. 若 `runtimeSurface.previewUrl` 存在，可作为「打开运行预览」链接展示。它指向 `GET /generated-apps/public/:token/preview`，返回构建产物中的 `dist/index.html`（`text/html`），不返回源码、测试报告或产物清单。
6. 提交 `POST /generated-apps/public/:token/submissions`，最小请求体 `{ "input": {…} }`；可附 `anonymousSessionId`，它只是匿名会话标识，不用于鉴权。
7. 用 `GET /generated-apps/public/:token/submissions/:submissionId` 读取 `status`、`result`、`report`、`errorMessage`，把 `report.sections`、下一步问题、追问提示与免责声明渲染给用户；需要轮询时按下一节的状态机处理。
8. 创建者在登录态用 `GET /generated-apps/:appId/submissions`、`GET /generated-apps/:appId/submissions/:submissionId`、`DELETE /generated-apps/:appId/submissions/:submissionId` 或批量 `POST /generated-apps/:appId/submissions/delete` 管理提交。

## TypeScript 示例

```ts
const apiBase = "https://agentloom.ling.plus/api/v1";
const creatorJwt = process.env.AGENTLOOM_JWT ?? ""; // 创建者的登录态 access token
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

// 创建者：创建、生成、开启公开链接
const app = await api<{ id: string }>("/generated-apps", {
  method: "POST",
  headers: creatorHeaders,
  body: JSON.stringify({ prompt: "自动化中医问诊信息整理系统" }),
});

const run = await api<{
  app: { readiness: { state: string; canCreatePublicShare: boolean } };
}>(`/generated-apps/${app.id}/generation-runs/start`, {
  method: "POST",
  headers: creatorHeaders,
  body: JSON.stringify({ triggerSource: "initial" }),
});

if (
  run.app.readiness.state !== "publish_candidate" ||
  !run.app.readiness.canCreatePublicShare
) {
  throw new Error("应用尚未通过发布门禁，不能开启公开链接。");
}

const shared = await api<{ publicShareUrl: string }>(
  `/generated-apps/${app.id}/public-share`,
  { method: "POST", headers: creatorHeaders },
);
const token = new URL(shared.publicShareUrl).pathname.split("/").pop() ?? "";

// 终端用户：读取表单、提交、读取报告
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
  report: { sections?: Array<{ title?: string; body?: string }> } | null;
  errorMessage: string | null;
}>(
  `/generated-apps/public/${encodeURIComponent(token)}/submissions/${submission.id}`,
);

console.log(detail.status, detail.errorMessage ?? detail.report);
```

## 轮询公开提交

终端前端只读 public submission detail，不调用登录态的执行接口。是否继续轮询看 `result` 或 `report` 里的 handoff 字段：

| 条件 | 前端行为 |
| --- | --- |
| 没有 `workflowExecution` 字段 | 展示 `report`，停止轮询 |
| `workflowExecution=false` | 展示 `report` 与 `workflowExecutionNotice`，停止轮询 |
| `workflowExecution=true` 且 `executionStatus` 为 `pending`、`running`、`paused` | 展示「正在执行」，保留本地报告，约 2 秒后再读 |
| `workflowExecution=true` 且 `executionStatus=completed` | 展示报告、执行状态与 `workflowExecutionSummary`，停止轮询 |
| `workflowExecution=true` 且 `executionStatus` 为 `failed`、`cancelled` | 展示报告与失败或取消提示，停止轮询 |

顶层 `status` 随之更新：`pending` → `received`，`running`/`paused` → `running`，`completed` → `completed`，`failed`/`cancelled` → `failed`。适合做列表徽标，但轮询判断以 handoff 字段为准。

## 公开响应里可以展示什么

- 公开 runtime：`appId`、`title`、`description`、`dataUseNotice`、有限的 `appSpec`、`runtimeSurface.previewUrl`、`runtimeForm`、`createdAt`。
- `runtimeForm`：`formId`、`title`、`description`、`submitLabel`、`sections[]`、`fields[]`、`resultView`；字段含 `id`、`label`、`type`、`required`、`placeholder`、`helpText`、`options`、`min`、`max`、`step`。`fields[]` 是完整字段集合，`sections[].fieldIds` 只用于分组；没被任何分组引用的字段放进兜底分组，照常参与必填校验。
- 公开提交：`id`、`appId`、`appSpecVersion`、`status`、`anonymousSessionId`、`input`、`result`、`report`、`errorMessage`、`createdAt`、`updatedAt`；绑定的工作流已发布时，`result`/`report` 还可能带 `workflowExecution`、`executionId`、`executionStatus`、`workflowDefinitionId`、`executionBoundary`、`workflowExecutionNotStartedReason`、`workflowExecutionNotice`、`workflowExecutionUpdatedAt`、`workflowExecutionCompletedAt`、`workflowExecutionSummary`。
- 公开响应可能含 `token` 字段供客户端缓存，页面上不得渲染或记录它。

终端页面不得展示或记录：`gateResults`、`readiness`、`generationPlan`、`sourceArtifactUrl`、`testReportUrl`、`pluginIds`、`publicShareToken`、`secrets`、组织 ID 与任何宿主机路径。生成链路的内部结构见 [生成应用实现](/dev/server/generated-apps)。
