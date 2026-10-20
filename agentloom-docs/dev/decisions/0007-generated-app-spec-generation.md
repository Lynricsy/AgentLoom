---
docType: explanation
---

# 0007 生成应用 v2：模型生成 AppSpec、按规格渲染表单、绑定真实工作流/Agent、Playwright 验收

- 状态：已实施
- 日期：2026-10-20

用户操作见 [生成应用](/guide/generated-apps/)，服务端现状见 [生成应用（服务端）](/dev/server/generated-apps)。本篇记录 v2 为什么这样设计。

## 背景

阶段 3 验收（D-147、D-148）确认：生成应用从需求到发布的每一环都是模板，门禁却全部通过。决策时的事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | AppSpec 由 `buildInitialAppSpec(prompt)` 按固定模板构造，不调用模型；`req-1` 原样复制 prompt，验收场景只有两条平台流程场景 | `agentloom-server/src/modules/generated-app/generated-app.app-spec.util.ts` |
| F2 | 公开运行表单是两套固定字段（通用 8 字段 / 问诊 7 字段，按正则判断「医疗领域」），提交后先跑本地 deterministic 报告 | `generated-app.runtime.ts`（`buildGeneralRuntimeFields`、`evaluateGeneratedAppLocalRuntime`） |
| F3 | Gate 7 创建的运行时工作流固定为 manual-trigger → text → text-output，提交只得到输入回显 | `generated-app.runtime-binding.util.ts` |
| F4 | Gate 3–7 的 `real` 模式是服务端 deterministic runner；Gate 5 没有 Playwright 执行层，`real-browser-e2e` 也 fail-closed；server 镜像与依赖不含 Playwright/浏览器 | `generated-app.browser-acceptance-runner.ts`、`agentloom-deploy/docker/server.Dockerfile` |
| F5 | 生成运行在请求内同步执行，请求处于租户事务中（拦截器无退出开关），长耗时调用会长时间占用事务 | `generated-app-generation-orchestrator.service.ts`、`agentloom-server/src/common/interceptors/tenant-transaction.interceptor.ts` |
| F6 | 服务端已有：一次性结构化输出 `OutputFormatService.executeStructuredOutput`（L1 原生结构化 → L2 JSON 提示 + 修复）；租户默认模型 `LlmService.findDefaultByType(tenantId, 'chat')`；工作流 `inputSchema`（text / number / single_select / multi_select）及公开提交按它投影校验；`runWorkflow` 支持 `workflowVersionId` 固定版本 | `modules/agent/output-format.service.ts`、`modules/agent-conversation/conversation-title.service.ts`、`modules/workflow/dto/workflow-input-schema.dto.ts`、`generated-app-public-runtime.service.ts`、`modules/execution/dto/run-workflow.dto.ts` |
| F7 | Studio 公开页按 `runtimeForm.fields[].type` 动态渲染表单，不依赖字段 id | `agentloom-studio/src/features/generated-app/components/GeneratedAppPublicRuntimePage.tsx` |
| F8 | 工作流版本快照含 `inputSchema`，输出节点为 `text-output` / `json-output` | `agentloom-server/src/database/schema/workflow-versions.schema.ts`、`modules/execution/node-output-port.util.ts` |

## 决策

### 1. AppSpec v2 与生成流程

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 契约位置 | Zod schema 在 `agentloom-server/src/modules/generated-app/types/app-spec-v2.schema.ts`，层间接口在同目录 `generation-v2.ports.ts`，浏览器任务契约在 `browser-acceptance-job.schema.ts` | **放进 `@agentloom/contracts`**：生成应用的线上形状一直由 server DTO 经 OpenAPI → api-client 输出；browser-runner 与 server 同一代码库，不跨包 |
| 两层 schema | 模型只产出 `GeneratedAppSpecDraftSchema`（需求、表单、结果视图、绑定选择、带浏览器步骤的 requirement 场景）；服务端补平台需求、页面、数据策略、范围边界、traceability、固定绑定版本、生成元数据，整体用 `GeneratedAppSpecV2Schema` 校验 | **让模型输出完整 AppSpec**：数据策略、traceability 是平台规则，交给模型只会多出可错的字段 |
| 跨字段规则 | `collectAppSpecReferenceIssues` 同时用于草稿与持久化：字段/分区/需求/场景 id 唯一；工作流绑定的每个字段都映射、每个结果分区都有输出；Agent 绑定恰好一个分区；requirement 场景填写全部必填字段、先 submit 后 expectResult、选择值在选项内；每条 prompt 需求至少一条 requirement 场景。结果断言只有 `nonEmpty`：本地验收（D-147）中模型写出「答案包含 草稿」这类断言，绑定目标的回答每次措辞不同，Gate 5 随之时过时不过 | **只做结构校验**：D-147 正是结构完整、语义空洞；**允许 `contains` 断言具体文字**：措辞由绑定目标的模型决定，断言不可复现 |
| 何时生成 | 生成运行的 Gate 0 第一步：AppSpec 缺失、v1、或 `start` 请求带 `regenerateAppSpec: true` / `triggerSource: 'retry'` 时生成，否则复用已存规格 | **创建请求内同步生成**：模型 10–120 秒，违背 F5 |
| 模型 | 创建 DTO 可选 `modelConfigId`（必须是本租户 chat 模型），否则用租户默认 chat 模型；都没有时 Gate 0 失败 `app-spec-model-unavailable`。选用的 id 写入新列 `generated_apps.generation_model_config_id`，repair 复用 | **固定平台模型**：租户自带密钥，平台没有可用的全局模型 |
| 调用 | `OutputFormatService.executeStructuredOutput`，`outputSchema = JSON.stringify(z.toJSONSchema(GeneratedAppSpecDraftSchema, { io: 'input' }))`，strictness strict、允许降级到 L2；超时 `APP_GENERATED_APP_SPEC_TIMEOUT_MS`（默认 120000）经 AbortSignal 取消 | 新写一套结构化输出：重复 F6 已有能力 |
| 提示词 | `generated-app.app-spec-prompt.ts` 中文系统提示：角色与输出规则（只能用候选 id、字段 id camelCase、每条需求给出可执行的浏览器步骤与具体填写值、问答/检索类场景的输入落在候选知识库覆盖的主题内、医疗/法律等高风险领域不输出诊断或建议类字段）；用户消息 = prompt 原文 + 候选目录 JSON（≤20 个、≤16KB，含输入字段、输出节点与知识范围：挂接的知识库名称、描述、已就绪文档名）+ 上一次的问题列表。知识范围在本地验收中补上：只给工作流名称与描述时，模型把需求本身改写成问题（「如何创建问答应用…」），知识库检索不到，引用分区为空 | — |
| 失败与自我修复 | Zod/引用/绑定解析的问题列表作为反馈重试，同一 Gate 0 内最多 `GENERATED_APP_SPEC_MAX_ATTEMPTS`（3）次；仍失败则 Gate 0 失败，failure 带问题列表、用量、模型输出前 2000 字符（脱敏）。原始输出不另存 | **失败即放弃**：结构化输出偶发不合规，带具体问题重试的成功率高 |
| v1 存量 | 迁移 0089 把 v1 应用的公开分享关闭，0090 清空 v1 的 `app_spec` 与 `generation_plan`，下一次运行由 Gate 0 按需求重新生成。删除 v1 类型、模板、医疗/通用固定字段与本地 deterministic 报告 | **保留 v1 运行路径**：两套运行时并存，且 v1 本身就是缺陷 |

### 2. 表单字段模型

字段类型 `text`、`textarea`、`number`、`single_select`、`multi_select`（去掉 v1 的 `range`，它只服务固定「优先级」字段）。字段 id 匹配 `^[a-z][a-zA-Z0-9_]{0,39}$`，同时是提交 JSON 的键与 Studio 渲染的 `data-field-id`。上限：20 个字段、选项 30 个、文本 4000 字符，见 `GENERATED_APP_SPEC_LIMITS`。公开表单 `PublicGeneratedAppRuntimeFormV2` = 表单 + 结果视图，提交按 AppSpec 严格校验（未知字段、类型、必填、长度、范围、选项），再按绑定投影。

### 3. 绑定目标与输入输出映射

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 绑定目标 | 已发布工作流或已发布 Agent。创建 DTO 可选 `bindingTarget`；省略时候选为本租户最近更新的已发布工作流（排除生成应用运行时工作流）与 Agent，最多 20 个，模型从中选 id；候选为空 → `app-spec-binding-candidates-empty` | **生成新工作流**：模型拼图的可靠性无法由门禁证明，且与「调用上述工作流」的需求不符 |
| 工作流输入映射 | 每个表单字段映射到固定版本快照 `inputSchema` 的一个字段：每个 required 输入都被映射，类型兼容（text/textarea→text、number→number、选择→同类型且选项是子集）；工作流无 `inputSchema` 时映射到顶层 `inputParams` 键 | — |
| 工作流输出映射 | 每个结果分区对应固定版本快照中一个 `text-output` / `json-output` 节点，`json-output` 可取一个键（`path`） | **沿用白名单抽取全部步骤输出**：无法对应到页面分区，也无法断言 |
| Agent 绑定 | Gate 4 构建并发布包装工作流 manual-trigger → agent（`agentDefinitionId` 固定版本）→ text-output，`inputSchema` 由表单字段生成，表单值以 JSON 作为用户消息；结果视图恰好一个分区承接回复。包装工作流 metadata 标 `generatedAppId`，删除应用时归档（D-150）。实施时由原定的 Gate 7 提前到 Gate 4：Gate 5 的验收提交要经它执行，Gate 7 只复用同一 AppSpec 对应的已发布版本 | **直接调 Agent 对话 API**：提交、执行、结果、计费会分成两套路径 |
| 版本 | 生成时固定已发布版本（`workflowVersionId` / `agentVersionId`），Gate 4 复核，Gate 7 记录；公开提交以 `runWorkflow(…, { workflowVersionId })` 执行固定版本。源工作流重新发布后应用不受影响，要采用新版本需重新运行生成；runtime-binding-readiness 新增 `workflow_version_drift`（提示，不阻断） | **跟随最新发布**：上游改了 inputSchema 会让已发布应用直接 422，与 ADR-0006 的版本冻结原则相反 |
| 结果 | 提交执行结束后按 outputMapping 取步骤结果，经公开脱敏后写入 submission `result.sections`；执行失败只给公开可见的通用原因 | — |

### 4. 门禁

| Gate | v2 校验内容 | 失败码（Gate 内部，不是 HTTP 错误） |
| --- | --- | --- |
| 0 需求规格 | 生成（按需）→ `GeneratedAppSpecV2Schema` → 绑定解析（目标存在、已发布、创建者可访问、映射与快照兼容）；证据含模型 id、尝试次数、用量 | `app-spec-model-unavailable` / `app-spec-binding-candidates-empty` / `app-spec-model-output-invalid` / `app-spec-binding-invalid` / `app-spec-generation-timeout` |
| 1 架构计划 | `planVersion: 2`：需求 → 场景 → 字段/结果分区 → 绑定的覆盖矩阵，不含固定字段 | `generation-plan-coverage-gap` |
| 2 静态合约 | 公开输入 JSON Schema 由表单生成；结果合约由分区生成；与固定版本 `inputSchema` 的兼容性；Agent 绑定的包装工作流图经现有图结构校验 | `static-contract-mismatch` |
| 3 构建与单元 | 工作区由 v2 物化（`app-spec.ts`、`runtime-form.ts`、`static-contracts.ts`），contract 测试对每个 requirement 场景：步骤值通过提交校验，投影后的 `inputParams` 通过 `validateSubmissionAgainstWorkflowInputSchema`；另有未知字段、缺必填字段两个拒绝用例 | `gate-3-workspace-materialization-failed` / `gate-3-command-failed` |
| 4 集成 | 不执行：重新解析绑定（仍发布、固定版本仍是当前版本、创建者仍有权限、Agent 模型配置可用）；Agent 绑定在此创建并发布包装工作流，走发布校验链 | `binding-drifted` / `binding-unavailable` |
| 5 浏览器验收 | Playwright 真实执行每个 requirement 场景 × 桌面/移动视口：打开公开页 → 按步骤填写/选择 → 提交 → 等待执行结束 → 断言结果分区；收集 console error、同源失败请求、截图与 trace | `gate-5-browser-runner-unavailable` / `gate-5-browser-runner-timeout` / `gate-5-browser-launch-failed` / `gate-5-scenario-failed` |
| 6 独立审查 | 确定性复核证据：每条 prompt 需求至少一个场景在两个视口都通过、无 console error、无公开 API（`/api/`）失败请求、结果分区非空、artifact 在对象存储中存在；静态资源失败及 Chromium 对应的 `Failed to load resource:` console 记录不阻断 | `verifier-blocking-finding` |
| 7 发布候选 | manifest（AppSpec sha256、固定绑定版本、各 Gate 证据 id、artifact key）；`ensureRuntimeWorkflow` 写 `workflow_definition_id`（工作流绑定为被绑定工作流，Agent 绑定复用 Gate 4 的包装工作流）；fixture 结果不放行 | `gate-7-fixture-not-publish-candidate` / `gate-7-publish-candidate-contract-blocked` |

Gate 6 不调用模型做主观评审：主观评分不可复现，且真实执行与断言已在 Gate 5 完成。各 runner 的执行模式收敛为 `real` / `fixture` / `disabled`，删除 `real-local-*` 执行级别与 `real-browser-e2e` 别名。

### 5. 生成运行异步化

`POST /generated-apps` 写入应用（新状态 `app_spec_generating`，`app_spec` 列改为可空）并入队 `initial` 运行，响应带 `generationRunId`；`POST /:appId/generation-runs/start` 返回 202 与 `queued` 运行，已有 `queued`/`running` 运行时 409 `generated-app-generation-run-in-progress`。新队列 `generated-app-generation`（attempts 1、jobId 为 runId、`removeOnComplete` 500 / `removeOnFail` 1000），worker 并发 `APP_GENERATED_APP_GENERATION_CONCURRENCY`（默认 2）。每个 Gate 的读写在各自的 `runInTenantTransaction` 内，模型调用与等待 Gate 5 时不持有事务。`maxRuntimeSeconds` 由 job 内计时强制。

### 6. Gate 5 执行层

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 进程位置 | 独立容器 `generated-app-browser-runner`：server 镜像的新构建目标 `browser-runner`，入口 `dist/src/generated-app-browser-runner.main.js`，只启动消费 `generated-app-browser-acceptance` 队列的 Nest 应用上下文（Config、Redis、Storage），不连数据库 | **server/worker 进程内**：Chromium 单实例约 1GB 内存，崩溃会带走 worker；它渲染的是生成内容，应与持有数据库凭据的进程隔离；server 镜像不应背上约 450MB 浏览器层 |
| 通信 | worker 侧执行器签发验收令牌 → 投递任务（jobId `gate5-<runId>`）→ `job.waitUntilFinished(queueEvents, totalTimeout + 30s)` → 撤销令牌；`queue.getWorkers()` 为空时立即 `gate-5-browser-runner-unavailable` | HTTP 调 runner：要多一套鉴权与服务发现，队列已有 |
| 访问入口 | runner 打开 `${APP_GENERATED_APP_BROWSER_BASE_URL}/generated-apps/public/<验收令牌>`，即真实用户使用的 Studio 公开页；Compose 默认 `http://reverse-proxy`（内网同源访问 Studio 与 API），Helm 默认 `http(s)://<ingress.host>` | 打开 Gate 3 静态预览：不是终端用户的真实页面 |
| 验收令牌 | `generated_apps` 新增 `acceptance_token_hash`、`acceptance_token_expires_at`、`acceptance_generation_run_id`；令牌 32 字节 hex，只存 sha256，TTL = 总超时 + 60s。公开路由先按公开分享令牌、再按未过期验收令牌取应用；验收令牌创建的提交 `origin = 'gate-acceptance'`（`generated_app_submissions` 新列，默认 `public`，另记 `generation_run_id`），创建者提交列表默认排除、不计浏览量 | **复用公开分享令牌**：Gate 5 在发布前执行，此时没有也不应有公开链接 |
| 浏览器 | Playwright `chromium`（`playwright` 包精确版本进 server dependencies；`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 安装，runner 目标里 `playwright install --with-deps chromium` 到 `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`）；`chromiumSandbox: false`，靠容器隔离：非 root、只读根文件系统、无额外 capability、`shm_size: 1gb`；页面请求拦截只放行入口同源 | 启用 Chromium 沙箱：需要宿主允许非特权 user namespace 或放开 seccomp，部署前提不可控 |
| 资源与超时 | 每容器并发 `APP_GENERATED_APP_BROWSER_CONCURRENCY`（1），场景超时 `APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS`（180000），总超时 `APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS`（900000）；每次最多 5 个场景 × 2 视口；容器 2 CPU / 2GiB | — |
| 产物 | 每个场景 × 视口一张整页截图与一个 trace zip，上传到 `tenants/<tenantId>/generated-apps/<appId>/runs/<runId>/gate-5/`，证据记 key，创建者经预签名链接查看（D-146）。console 与请求路径在 runner 内脱敏（令牌、宿主路径） | — |
| 成本 | Gate 5 真实执行绑定的工作流/Agent，消耗创建者租户的模型用量，计入执行记录；场景上限即单次运行的执行上限 | 用 fixture 代替：即 D-148 |

## 后果

- 变容易：门禁结论对应真实行为——Gate 0 看得到需求是否被理解，Gate 5 看得到页面是否真能回答问题。
- 变困难：生成一次应用要消耗模型调用与若干次真实执行，耗时从 1 秒变为数分钟；部署多一个 browser-runner 服务；没有可用 chat 模型或没有已发布工作流/Agent 的租户无法生成应用。
- 新约束：AppSpec 变化必须同时改 `app-spec-v2.schema.ts` 与单测；绑定一律固定版本；公开路由必须区分公开令牌与验收令牌；v1 规格不再有运行路径。
- 需要迁移：`generated_app_status` 增加 `app_spec_generating`；`generated_apps` 增加 `generation_model_config_id`、三列验收令牌，`app_spec` 改为可空；`generated_app_submissions` 增加 `origin`、`generation_run_id`；v1 应用关闭公开分享。
- 新环境变量（同步 env schema、`.env.example`、部署模板与配置参考）：`APP_GENERATED_APP_SPEC_TIMEOUT_MS`、`APP_GENERATED_APP_GENERATION_CONCURRENCY`、`APP_GENERATED_APP_BROWSER_BASE_URL`、`APP_GENERATED_APP_BROWSER_CONCURRENCY`、`APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS`、`APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS`。
- 新 HTTP 错误（同步 `guide/troubleshooting/errors.md`）：`generated-app-binding-target-not-found`（422，创建时指定的绑定目标不存在或未发布）、`generated-app-generation-run-in-progress`（409）。

## 确认方式

- `agentloom-server/src/modules/generated-app/__tests__/app-spec-v2.schema.spec.ts`：草稿与持久化 schema 的跨字段规则、浏览器任务契约。
- 本地：创建「一个问答页面：输入问题，调用上述工作流返回答案与引用」并指定文档问答工作流，Gate 0 产出含 `question` 字段、绑定该工作流固定版本的 AppSpec；Gate 5 证据含两个视口的截图与 trace，结果分区「答案」「引用」非空；公开提交得到答案与引用。
- 未启动 browser-runner 时 Gate 5 立即失败 `gate-5-browser-runner-unavailable`；任何模式都不会出现「未启动浏览器却 passed」。
- `server.Dockerfile` 的 `browser-runner` 目标能 `node -e "require('playwright').chromium.launch().then(b=>b.close())"`；`production` 目标不含 `/ms-playwright`。
