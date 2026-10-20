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

1. `POST /generated-apps`，请求体 `{ "prompt": "…" }`（1–4000 字符）创建应用。可选字段：
   - `modelConfigId`：生成规格用的模型配置 ID，必须是当前组织已启用的 chat 模型；不存在时 404 `llm/config-not-found`，不是 chat 模型或已停用时 400 `llm/config-validation`。
   - `bindingTarget`：应用提交时调用的目标，`{ "kind": "workflow", "workflowDefinitionId": "…" }` 或 `{ "kind": "agent", "agentDefinitionId": "…" }`，必须已发布；否则 422 `generated-app-binding-target-not-found`。

   返回 201：`status` 为 `app_spec_generating`、`appSpec` 为 `null`，`generationModelConfigId`、`bindingTarget` 回显这两个选择（未指定时为 `null`），另带 `generationRunId`——服务端已经排队了首次（`initial`）生成运行，不需要再调用 start，紧接着调用会得到 409 `generated-app-generation-run-in-progress`。
2. 生成在后台执行（先由模型生成 AppSpec，再依次执行 Gate 0–7），通常需要几分钟。用 `GET /generated-apps/:appId/generation-runs/:runId` 轮询运行，`status` 为 `queued`、`running`、`repairing` 时继续等待，`passed`、`failed`、`cancelled` 为终态；`summary` 是最近一个 Gate 的结论，失败时 `failureReason` 给出原因。各 Gate 的结果用 `GET /generated-apps/:appId/gate-runs?generationRunId=<runId>` 读取，每个 Gate 结束时写入一条。运行结束后用 `GET /generated-apps/:appId` 读取 `readiness`。

   要重新运行时调用 `POST /generated-apps/:appId/generation-runs/start`，可选 `regenerateAppSpec: true` 让 Gate 0 按需求重新生成规格。返回 202，`generationRun.status` 为 `queued`、`gateRuns` 为空数组，随后同样按 `generationRun.id` 轮询。同一应用已有 `queued` 或 `running` 的运行时返回 409 `generated-app-generation-run-in-progress`。
3. 当 `app.readiness.state === "publish_candidate"` 且 `app.readiness.canCreatePublicShare === true` 时，`POST /generated-apps/:appId/public-share` 开启公开链接，响应中的 `publicShareUrl` 末段即公开 token。未达到条件时返回 409：

   ```text
   {"type":"https://agentloom.dev/errors/generated-app-public-share-not-ready","title":"生成应用尚不可发布","status":409,"detail":"生成应用 01a0f6e5-6c69-7e2d-8405-d64ef9eca972 尚未满足正式公开链接门槛：阻断门禁尚未全部通过，当前生成结果只能作为创建者预览或开发中试运行。","instance":"/api/v1/generated-apps/01a0f6e5-6c69-7e2d-8405-d64ef9eca972/public-share"}
   ```

4. 终端用户的页面调用 `GET /generated-apps/public/:token`，按 `runtimeForm.fields` 渲染输入控件、按 `runtimeForm.resultView.sections` 准备结果区。token 无效、链接已关闭或应用不再满足公开条件时返回 404 `generated-app-not-found`。
5. 若 `runtimeSurface.previewUrl` 不为 `null`，可作为「打开运行预览」链接展示。
6. 提交 `POST /generated-apps/public/:token/submissions`，请求体 `{ "input": { "<字段 id>": 值 } }`；可附 `anonymousSessionId`（只是匿名会话标识，不用于鉴权）和 `clientContext`。`input` 按表单严格校验：未声明的字段、必填为空、类型不符、超过 `maxLength`、超出 `min`/`max`、选项外的值都返回 422 `generated-app-public-submission-invalid`，`errors[]` 的 `field` 形如 `input.<字段 id>`，此时不产生提交记录、不启动执行。校验通过后服务端以生成时固定的版本创建异步执行，返回 201，`status` 为 `received` 或 `running`。
7. 用 `GET /generated-apps/public/:token/submissions/:submissionId` 轮询，直到 `result.status` 不是 `running`，再按 `result.sections` 渲染结果，见下文[轮询公开提交](#轮询公开提交)。
8. 创建者在登录态用 `GET /generated-apps/:appId/submissions`、`GET /generated-apps/:appId/submissions/:submissionId`、`DELETE /generated-apps/:appId/submissions/:submissionId` 或批量 `POST /generated-apps/:appId/submissions/delete` 管理提交。列表默认只返回终端用户的提交（`origin=public`）；`?origin=gate-acceptance` 返回 Gate 5 浏览器验收在公开页上产生的提交，它们带 `generationRunId`。创建者看到的 `report` 是执行引用：`executionId`、`workflowDefinitionId`、`workflowVersionId`（固定版本）、`notStartedReason`（未启动执行时的原因，如 `workflow_not_published`）。

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

// 创建者：创建（自动排队首次生成运行）、等待运行结束、开启公开链接
const app = await api<{ id: string; generationRunId: string }>(
  "/generated-apps",
  {
    method: "POST",
    headers: creatorHeaders,
    body: JSON.stringify({
      prompt: "一个问答页面：输入问题，调用知识库问答工作流返回答案与引用",
      bindingTarget: { kind: "workflow", workflowDefinitionId: "<已发布工作流 ID>" },
    }),
  },
);

type GenerationRun = { status: string; summary: string; failureReason: string | null };
let run = await api<GenerationRun>(
  `/generated-apps/${app.id}/generation-runs/${app.generationRunId}`,
  { headers: creatorHeaders },
);
while (["queued", "running", "repairing"].includes(run.status)) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  run = await api<GenerationRun>(
    `/generated-apps/${app.id}/generation-runs/${app.generationRunId}`,
    { headers: creatorHeaders },
  );
}

const current = await api<{
  readiness: { state: string; canCreatePublicShare: boolean };
}>(`/generated-apps/${app.id}`, { headers: creatorHeaders });

if (
  current.readiness.state !== "publish_candidate" ||
  !current.readiness.canCreatePublicShare
) {
  throw new Error(run.failureReason ?? "应用尚未通过发布门禁，不能开启公开链接。");
}

const shared = await api<{ publicShareUrl: string }>(
  `/generated-apps/${app.id}/public-share`,
  { method: "POST", headers: creatorHeaders },
);
const token = new URL(shared.publicShareUrl).pathname.split("/").pop() ?? "";

// 终端用户：读取表单、提交、轮询结果
type ResultSection = {
  sectionId: string;
  label: string;
  format: "text" | "markdown" | "citations" | "json";
  value: unknown;
};
type PublicSubmission = {
  id: string;
  status: "received" | "running" | "completed" | "failed";
  result: {
    status: "running" | "completed" | "failed";
    sections: ResultSection[];
    publicError: string | null;
  } | null;
};

const runtime = await api<{
  runtimeForm: {
    fields: Array<{ id: string; label: string; type: string; required: boolean }>;
  };
}>(`/generated-apps/public/${encodeURIComponent(token)}`);

// 只填必填字段；选填字段留空时不要放进 input
const input = Object.fromEntries(
  runtime.runtimeForm.fields
    .filter((field) => field.required)
    .map((field) => [field.id, `示例：${field.label}`]),
);

const publicPath = `/generated-apps/public/${encodeURIComponent(token)}/submissions`;
let submission = await api<PublicSubmission>(publicPath, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input }),
});

while (!submission.result || submission.result.status === "running") {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  submission = await api<PublicSubmission>(`${publicPath}/${submission.id}`);
}

if (submission.result.status === "failed") {
  console.log(submission.result.publicError);
} else {
  for (const section of submission.result.sections) {
    console.log(section.label, section.value);
  }
}
```

## 轮询公开提交

终端前端只读 public submission detail，不调用登录态的执行接口。服务端在每次读取时按执行状态刷新结果，执行结束后把结果写入提交，之后的读取不再查询执行。

| `result.status` | 顶层 `status` | 前端行为 |
| --- | --- | --- |
| `running`（或 `result` 为 `null`） | `received`、`running` | 展示「正在处理」，约 2 秒后再读 |
| `completed` | `completed` | 按 `result.sections` 展示结果，停止轮询 |
| `failed` | `failed` | 展示 `result.publicError`，停止轮询 |

`result.sections` 与 `runtimeForm.resultView.sections` 一一对应、顺序相同，每项是 `{ sectionId, label, format, value }`。`value` 已在服务端公开脱敏，绑定的输出缺失时为 `null`：

| `format` | `value` |
| --- | --- |
| `text` | 字符串，按纯文本展示（保留换行） |
| `markdown` | 字符串，按 Markdown 渲染，不要执行其中的 HTML |
| `citations` | 数组，每项含可选的 `title`、`quote`、`source` |
| `json` | 任意 JSON 值 |

`publicError` 只给出通用原因，例如「应用暂时无法处理提交，请稍后再试或联系应用创建者。」；具体原因（运行时绑定状态、执行服务拒绝的错误类型）只出现在创建者可见的 `report.notStartedReason` 里。

## 公开响应里可以展示什么

- 公开 runtime：`appId`、`title`、`description`、`dataUseNotice`、有限的 `appSpec`（`version`、`appName`、`summary`、`userGoal`、`actors`、`pages`）、`runtimeSurface.previewUrl`、`runtimeForm`、`createdAt`。
- `runtimeForm`：`formId`、`title`、`description`、`submitLabel`、`fields[]`、`resultView`。字段的公共属性是 `id`（也是 `input` 的键）、`label`、`type`、`required`、`placeholder`、`helpText`；`text`/`textarea` 另有 `maxLength`，`number` 另有可选的 `min`、`max`，`single_select`/`multi_select` 另有 `options[]`（`value`、`label`）。`resultView` 含 `title`、`emptyState`、`sections[]`（`id`、`label`、`format`）。
- 公开提交：`id`、`appId`、`appSpecVersion`、`status`、`anonymousSessionId`、`input`、`result`、`errorMessage`、`createdAt`、`updatedAt`。公开提交不含 `report`。
- 公开响应可能含 `token` 字段供客户端缓存，页面上不得渲染或记录它。

终端页面不得展示或记录：`gateResults`、`readiness`、`generationPlan`、`publicShareToken`、`secrets`、组织 ID 与任何宿主机路径。生成链路的内部结构见 [生成应用实现](/dev/server/generated-apps)。

### Studio 公开页的 DOM 约定

Gate 5 的 browser-runner 在 Studio 公开页 `/generated-apps/public/:token` 上按以下属性定位元素；自建公开页若要复用同一套验收步骤，需要提供相同的属性：

| 元素 | 属性 |
| --- | --- |
| `text`、`textarea`、`number` 的输入控件 | `data-field-id="<字段 id>"` |
| `single_select`、`multi_select` 的选项容器 / 选项 | 容器 `data-field-id`；每个选项 `data-option-value="<value>"`，带 `aria-checked` |
| 提交按钮 | 表单内唯一的 `button[type=submit]` |
| 结果容器 | `data-result-status`（`running`、`completed`、`failed`）与 `data-submission-id` |
| 结果分区 | `data-result-section-id="<分区 id>"`，元素内只含分区内容本身 |
