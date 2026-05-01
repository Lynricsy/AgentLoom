# Generated App Generation Contracts

## Scenario: Natural-Language Generated App Harness

### 1. Scope / Trigger

- Trigger: implementing or modifying `src/modules/generated-app/**`, `generated_apps` schema/migrations, generated-app public share endpoints, or any generation gate runner that writes `gateResults`.
- This contract covers the first platform-level harness for "one prompt -> generated app" and must preserve the distinction between creator preview, trial, publish candidate, and public end-user runtime.
- Do not treat a visual preview as publish readiness. Public links are only valid after blocking gates pass and no warning remains.

### 2. Signatures

- DB table: `generated_apps`
  - `id uuid primary key`
  - `tenant_id uuid not null`
  - `prompt text not null`
  - `app_name varchar(255) not null`
  - `description text not null`
  - `status generated_app_status not null`
  - `app_spec jsonb not null`
  - `generation_plan jsonb null`; after Gate 2 runs, the deterministic static contract skeleton is stored under `generationPlan.staticContracts`; after Gate 3 runs, the Generation Workspace contract, command plan, and build/unit execution plan are stored under `generationPlan.buildUnitPlan`; after Gate 4 runs, the deterministic integration plan and runner contract are stored under `generationPlan.integrationPlan`; after Gate 5 runs, the browser acceptance plan and configured runner contract are stored under `generationPlan.browserAcceptancePlan`; after Gate 6 runs, the independent verifier plan, configured verifier runner, and verdict artifact contract are stored under `generationPlan.independentVerificationPlan`; after Gate 7 runs, the deterministic publish-candidate contract plan, release manifest contract, artifact placeholder signoff, and public-share deferred controls are stored under `generationPlan.publishCandidatePlan`
  - `gate_results jsonb not null`
  - `readiness jsonb not null`
  - `preview jsonb not null`
  - optional resource bindings: `agent_definition_id`, `workflow_definition_id`, `plugin_ids`
  - public link state: `public_share_token`, `public_share_enabled`, `public_share_created_at`, `public_share_disabled_at`, `public_view_count`
- DB table: `generated_app_submissions`
  - `id uuid primary key default uuid_generate_v7()`
  - `tenant_id uuid not null`
  - `generated_app_id uuid not null references generated_apps(id) on delete cascade`
  - `app_spec_version integer not null`
  - `public_share_token text not null`
  - `anonymous_session_id varchar(128) not null`
  - `status generated_app_submission_status not null default 'received'`
  - `input jsonb not null default '{}'::jsonb`
  - nullable runtime outputs: `result`, `report`, `error_message`
  - lifecycle columns: `created_at`, `updated_at`, `deleted_at`
  - direct tenant RLS via `tenant_id`; public endpoints must write through the raw/global DB only after resolving a currently valid public app by token.
- DB table: `generated_app_gate_runs`
  - `id uuid primary key default uuid_generate_v7()`
  - `tenant_id uuid not null`
  - `generated_app_id uuid not null references generated_apps(id) on delete cascade`
  - optional run links: `generation_run_id`, `repair_attempt_id`
  - canonical gate snapshot: `gate_id`, `gate_order`, `gate_name`, `blocking`
  - `attempt_number integer not null default 1`
  - `status generated_app_gate_run_status not null`
  - `summary text not null`
  - `evidence jsonb not null default '[]'::jsonb`
  - nullable repair fields: `failure`, `repair_instructions`
  - lifecycle/audit columns: `started_at`, `completed_at`, `created_by`, `created_at`, `updated_at`
  - direct tenant RLS via `tenant_id`; creator endpoints must use tenant-aware DB access.
- DB table: `generated_app_generation_runs`
  - `id uuid primary key default uuid_generate_v7()`
  - `tenant_id uuid not null`
  - `generated_app_id uuid not null references generated_apps(id) on delete cascade`
  - `run_number integer not null default 1`
  - `status generated_app_generation_run_status not null default 'running'`
  - `trigger_source generated_app_generation_run_trigger not null default 'manual'`
  - budget columns: `max_repair_attempts`, `max_runtime_seconds`
  - result columns: `summary`, `failure_reason`
  - lifecycle/audit columns: `started_at`, `completed_at`, `created_by`, `created_at`, `updated_at`
  - direct tenant RLS via `tenant_id`; this table is the parent ledger for a full prompt-to-app generation loop.
- DB table: `generated_app_repair_attempts`
  - `id uuid primary key default uuid_generate_v7()`
  - `tenant_id uuid not null`
  - `generated_app_id uuid not null references generated_apps(id) on delete cascade`
  - `generation_run_id uuid not null references generated_app_generation_runs(id) on delete cascade`
  - `attempt_number integer not null default 1`
  - `target_gate_id varchar(64) not null`
  - `status generated_app_repair_attempt_status not null default 'running'`
  - repair narrative fields: `failure_summary`, `change_summary`, `verification_summary`
  - lifecycle/audit columns: `started_at`, `completed_at`, `created_by`, `created_at`, `updated_at`
  - direct tenant RLS via `tenant_id`; each repair attempt belongs to one generation run and one generated app.
- Status enum:
  - `app_spec_ready`
  - `preview_ready`
  - `trial_ready`
  - `publish_candidate`
  - `published`
  - `failed`
- Submission status enum:
  - `received`
  - `running`
  - `completed`
  - `failed`
- Gate run status enum:
  - `running`
  - `passed`
  - `failed`
  - `warning`
  - `skipped`
- Generation run status enum:
  - `queued`
  - `running`
  - `repairing`
  - `passed`
  - `failed`
  - `cancelled`
- Generation run trigger enum:
  - `initial`
  - `manual`
  - `retry`
  - `system`
- Repair attempt status enum:
  - `planned`
  - `running`
  - `completed`
  - `failed`
  - `skipped`
- Authenticated API:
  - `POST /generated-apps`
  - `GET /generated-apps`
  - `GET /generated-apps/:appId`
  - `PATCH /generated-apps/:appId/gates`
  - `GET /generated-apps/:appId/generation-runs?page=&pageSize=&status=`
  - `POST /generated-apps/:appId/generation-runs`
  - `POST /generated-apps/:appId/generation-runs/start`
  - `PATCH /generated-apps/:appId/generation-runs/:runId`
  - `GET /generated-apps/:appId/generation-runs/:runId/repair-attempts?page=&pageSize=&status=&targetGateId=`
  - `POST /generated-apps/:appId/generation-runs/:runId/repair-attempts`
  - `PATCH /generated-apps/:appId/generation-runs/:runId/repair-attempts/:repairAttemptId`
  - `GET /generated-apps/:appId/gate-runs?page=&pageSize=&gateId=&status=`
  - `POST /generated-apps/:appId/gate-runs`
  - `POST /generated-apps/:appId/public-share`
  - `POST /generated-apps/:appId/public-share/regenerate`
  - `DELETE /generated-apps/:appId/public-share`
  - `GET /generated-apps/:appId/submissions?page=&pageSize=&status=`
  - `GET /generated-apps/:appId/submissions/:submissionId`
  - `DELETE /generated-apps/:appId/submissions/:submissionId`
  - `POST /generated-apps/:appId/submissions/delete`
- Public API:
  - `GET /generated-apps/public/:token`
  - `POST /generated-apps/public/:token/submissions`
  - `GET /generated-apps/public/:token/submissions/:submissionId`
  - Must be decorated with `@Public()` and excluded from `TenantMiddleware` in `app.module.ts`.

### 3. Contracts

- `CreateGeneratedAppDto`
  - `prompt`: trimmed string, 1-4000 chars.
  - Initial implementation may use a deterministic normalizer, but it must still produce a structured `AppSpec` with core requirements, pages, data policy, acceptance scenarios, and traceability.
- `RecordGeneratedAppGateResultsDto`
  - `gateResults`: 1-32 gate result objects.
  - `generationPlan`: optional object or null.
  - `preview`: optional object with nullable `previewUrl`, `sourceArtifactUrl`, `testReportUrl`.
- `CreateGeneratedAppGateRunDto`
  - `gateId`: one of canonical Gate 0-7 ids (`gate-0` through `gate-7`).
  - `generationRunId`: optional UUID linking this gate evidence to one generation run.
  - `repairAttemptId`: optional UUID linking this gate evidence to one repair attempt.
  - `attemptNumber`: integer 1-100, default 1.
  - `status`: `running | passed | failed | warning | skipped`.
  - `summary`: required human-readable result summary.
  - `evidence`: optional array of gate evidence objects; defaults to `[]`.
  - `failure`: optional `{ code?, message, details? }` object for failed or degraded runs.
  - `repairInstructions`: optional human-readable next repair instruction.
  - `startedAt` / `completedAt`: optional ISO timestamps; non-running runs default `completedAt` to server time when omitted.
- `CreateGeneratedAppGenerationRunDto`
  - `runNumber`: integer 1-1000, default 1.
  - `status`: `queued | running | repairing | passed | failed | cancelled`, default `running`.
  - `triggerSource`: `initial | manual | retry | system`, default `manual`.
  - `maxRepairAttempts`: integer 0-20, default 3.
  - `maxRuntimeSeconds`: integer 1-86400, default 1800.
  - `summary`: required human-readable generation loop summary.
  - `failureReason`: optional nullable failure reason.
  - `startedAt` / `completedAt`: optional ISO timestamps.
- `StartGeneratedAppGenerationRunDto`
  - `triggerSource`: `initial | manual | retry | system`, default `manual`.
  - `maxRepairAttempts`: integer 0-20, default 3.
  - `maxRuntimeSeconds`: integer 1-86400, default 1800.
  - The response returns `{ generationRun, gateRuns, app }`, where `gateRuns` contains the gate runs produced by the synchronous runner and `app` is the creator-side generated app after readiness sync.
- `UpdateGeneratedAppGenerationRunDto`
  - Allows patching `status`, `summary`, `failureReason`, `startedAt`, and `completedAt`.
- `CreateGeneratedAppRepairAttemptDto`
  - `attemptNumber`: integer 1-100, default 1.
  - `targetGateId`: one of canonical Gate 0-7 ids.
  - `status`: `planned | running | completed | failed | skipped`, default `running`.
  - `failureSummary`: required summary of the gate failure being repaired.
  - `changeSummary`: optional nullable summary of source / graph / plugin changes.
  - `verificationSummary`: optional nullable summary of post-repair verification.
  - `startedAt` / `completedAt`: optional ISO timestamps.
- `UpdateGeneratedAppRepairAttemptDto`
  - Allows patching `status`, `failureSummary`, `changeSummary`, `verificationSummary`, `startedAt`, and `completedAt`.
- Canonical gates:
  - `gate-0` requirement spec
  - `gate-1` architecture plan
  - `gate-2` static contracts
  - `gate-3` build and unit
  - `gate-4` integration
  - `gate-5` browser acceptance
  - `gate-6` independent verifier
  - `gate-7` publish candidate
- Readiness rules:
  - Any blocking gate not passed -> `preview`, `canCreatePublicShare=false`.
  - Any blocking gate failed -> `blocked`, `canCreatePublicShare=false`.
  - All blocking gates passed but any non-blocking warning exists -> `trial`, `canCreatePublicShare=false`.
  - All blocking gates passed and no warning exists -> `publish_candidate`, `canCreatePublicShare=true`.
  - A `publish_candidate` readiness computed from `gateResults` must also pass the service-side publish candidate evidence guard before it is persisted. The guard must reject manual, fixture, disabled, skeleton, malformed, or stale evidence that lacks trusted Gate 7 real-local publish-candidate runner details, even when all canonical blocking gates are marked `passed`.
- Gate run recording:
  - `POST /generated-apps/:appId/gate-runs` must first resolve the generated app in tenant scope.
  - Each gate run stores an immutable attempt row in `generated_app_gate_runs` with the canonical gate definition snapshot and the supplied evidence/failure/repair data.
  - If `generationRunId` is supplied, it must belong to the same tenant and generated app.
  - If `repairAttemptId` is supplied, it must belong to the same tenant and generated app; when `generationRunId` is also supplied, the repair attempt must belong to that generation run.
  - The same request must update `generated_apps.gate_results`, replacing the current summary for that canonical gate while preserving other gates through canonical normalization.
  - The request must recompute `generated_apps.readiness` and `generated_apps.status` from the full normalized gate result set.
  - If recomputation would produce `publish_candidate`, the service must first validate the current or submitted `generationPlan.publishCandidatePlan` plus Gate 7 evidence: Gate 3-6 execution levels must be real-local, Gate 7 execution must be `real-local-publish-candidate-contract`, `finalVerdict.publishCandidateAllowed=true`, `finalVerdict.blockingReasons=[]`, release manifest entries must remain placeholder/not archived/not signed with `contract-accepted` signoff, rollback/share controls must defer public token creation, and Gate 7 evidence must include `gate-7-real-publish-candidate-runner` details with `executed=true`, `publicShareTokenCreated=false`, and `createdPublicShareToken=null`. If any check fails, the service must downgrade Gate 7 to `failed`, set readiness/status to blocked/failed, and clear public share state.
  - If the new readiness cannot create a public share, the request must set `public_share_enabled=false`, clear `public_share_token`, and set `public_share_disabled_at`.
  - The response returns `{ gateRun, app }`, where `gateRun` is the persisted run attempt and `app` is the updated creator-side generated app response.
- Gate run listing:
  - `GET /generated-apps/:appId/gate-runs` returns the standard paginated `{ data, meta }` envelope ordered by `created_at desc`.
  - Filters must include `tenant_id + generated_app_id`; optional `gateId`, `status`, `generationRunId`, and `repairAttemptId` filters narrow the list.
  - Creator response may include tenant and creator audit fields because the endpoint is authenticated and tenant-scoped.
- Generation run ledger:
  - `generated_app_generation_runs` is the high-level ledger for one automatic development/test loop, not a background worker by itself.
  - Create/update/list endpoints must use tenant-aware DB access and filter by `tenant_id + generated_app_id`.
  - List is ordered by `created_at desc` and uses the standard paginated `{ data, meta }` envelope.
  - Update is scoped by `tenant_id + generated_app_id + run_id`; missing rows return `GeneratedAppGenerationRunNotFoundException`.
- Synchronous gate runner:
  - `POST /generated-apps/:appId/generation-runs/start` must resolve the generated app in tenant scope, create a generation run, execute deterministic gates in order (`gate-0` AppSpec -> `gate-1` generation plan -> `gate-2` static contracts -> `gate-3` Generation Workspace + build/unit runner -> `gate-4` integration plan + runner -> `gate-5` browser acceptance plan + runner -> `gate-6` independent verifier plan + runner -> `gate-7` publish-candidate contract runner), and stop before the next gate when the current gate fails.
  - Gate 0 checks must validate that `AppSpec` has a usable app summary, actors, core requirements, pages/flows, data policy and scope boundary, acceptance scenarios, requirement coverage, and traceability. Failure evidence must include check labels, missing pieces, and repair instructions.
  - If Gate 0 passes, the runner must deterministically derive a structured `generationPlan` from `AppSpec`, persist it to `generated_apps.generation_plan`, execute the deterministic Gate 1 architecture-plan completeness check, and write one linked `generated_app_gate_runs` row for `gate-1`.
  - The persisted `generationPlan` must include stable fields for `appSpecVersion`, `frontend` page/runtime plan, `orchestration` Agent/Workflow plan, `pluginTools` plan with an explicit empty reason when no tools are required, `dataPersistence` plan, `testGates` plan for Gate 2-7, and requirement-level `traceability` to scenarios/pages/plan evidence.
  - Gate 1 checks must validate that the generation plan binds the current AppSpec version, covers all AppSpec pages, maps every core requirement into Agent/Workflow orchestration steps, records plugin/tool permission policy or an empty-plan reason, mirrors data persistence policy, defines Gate 2-7 test plans, and connects every core requirement to scenarios, pages, orchestration steps, and plan evidence. Traceability and plan references must point to existing AppSpec requirements/scenarios/pages, planned orchestration steps, and known plan evidence ids; non-empty but dangling references fail Gate 1.
  - If Gate 1 passes, the runner must deterministically derive `generationPlan.staticContracts` from `AppSpec + generationPlan`, persist the attempted contracts inside `generated_apps.generation_plan`, execute the deterministic Gate 2 static-contract completeness check, and write one linked `generated_app_gate_runs` row for `gate-2`.
  - The persisted `generationPlan.staticContracts` must include stable contract surfaces for public runtime input/output, frontend route/page, Workflow/Agent orchestration graph, plugin/tool permissions, public submission persistence, Gate 3-7 test entry commands, and requirement-level traceability.
  - Gate 2 checks must validate that static contracts bind the current AppSpec and generationPlan, cover public runtime inputs/outputs, every planned frontend page route and its requirement/scenario coverage, orchestration nodes/edges/handles as a DAG, plugin/tool manifest and permission hard gates for every planned tool, submission persistence fields including the public token snapshot, Gate 3-7 test entries including independent verifier and publish-candidate commands, and traceability from each core requirement to known static contract ids, scenarios, pages, and orchestration nodes.
  - If Gate 2 passes, the runner must deterministically derive a Gate 3 `generationWorkspace` contract and `commandPlan`, then derive `generationPlan.buildUnitPlan` from `AppSpec + generationPlan + staticContracts + generationWorkspace + commandPlan`, persist the attempted build/unit plan inside `generated_apps.generation_plan`, execute the deterministic Gate 3 build/unit plan completeness check, and only then invoke the Gate 3 workspace executor.
  - The persisted `generationPlan.buildUnitPlan` must include stable surfaces for a server-controlled Generation Workspace (`generationWorkspace`) and command plan (`commandPlan`) in addition to frontend build command, TypeScript typecheck command, unit test command, component/golden test entry, artifact expectations including plugin bundle artifacts when plugin tools are planned, staticContracts coverage, acceptanceScenario coverage, plugin build expectations with explicit empty reason when no plugin is planned, and failure capture fields.
  - `generationWorkspace` must use `storageKind='server-controlled-local-workspace'`, `rootLabel='generated-app-workspaces'`, a sanitized relative path under tenant/app/run segments, `scaffold='react-vite-typescript'`, `writePolicy.arbitraryPathWriteAllowed=false`, `writePolicy.traversalGuard='resolve-inside-workspace-root'`, and `writePolicy.exposesAbsoluteHostPath=false`. The contract must not expose an absolute host path to API consumers.
  - `commandPlan` must include the Gate 3 build, typecheck, unit, and component/golden command ids; each command must declare a command string, workspace-relative working directory, produced artifact ids, and requirement/scenario coverage.
  - Gate 3 checks must validate that `buildUnitPlan` binds the current AppSpec, generationPlan, and staticContracts versions; marks `executionLevel` as one of `contract-skeleton | real-local-command-plan | fixture-execution | disabled-execution`; includes the controlled workspace contract and command plan; covers every frontend route, core requirement, acceptance scenario, Gate 2 static contract id, required artifact expectation, plugin build expectation or explicit no-plugin reason, and required failure capture field; and rejects dangling requirement, scenario, route, static contract, coverage target, plugin tool, command id, workspace file, and artifact references.
  - In `real-local-command-plan` mode, Gate 3 must materialize a deterministic React/Vite/TypeScript app scaffold from `AppSpec` and `generationPlan.staticContracts` into the server-controlled workspace, execute controlled local commands, and store evidence with command id, command, exit code, stdout/stderr summaries, duration, artifact refs, and requirement/scenario coverage. The real-local runner must execute only server-authored allowlisted Node script entries with `shell=false`; it must reject unknown command ids, non-matching command strings, absolute script paths, traversal paths, or workspace-relative cwd mismatches before execution. Host absolute workspace paths must be redacted from stdout/stderr summaries, failures, and evidence. In `fixture-execution` mode, evidence must clearly mark `executed=false` and must not be described as a real build/test pass. In `disabled-execution` mode, Gate 3 must fail and stop the generation run.
  - Gate 3 materialization failure or command failure must write failed Gate 3 evidence, keep the attempted `generationPlan.buildUnitPlan`, mark the generation run failed with readable failure and repair instructions, keep Gate 4-7 not passed, and clear any active public token.
  - If Gate 3 passes, the runner must deterministically derive `generationPlan.integrationPlan` from `AppSpec + generationPlan + staticContracts + buildUnitPlan`, persist the attempted integration plan inside `generated_apps.generation_plan`, execute the deterministic Gate 4 integration plan completeness check, invoke the configured Gate 4 integration runner when the plan is complete, and write one linked `generated_app_gate_runs` row for `gate-4`.
  - The Gate 4 integration runner is selected by `GENERATED_APP_GATE4_EXECUTOR_MODE` or `APP_GENERATED_APP_GATE4_EXECUTOR_MODE`; supported modes are `real`, `fixture`, and `disabled`. The persisted `generationPlan.integrationPlan.executionLevel` must be one of `integration-skeleton | real-local-integration | fixture-integration | disabled-integration` and must match the configured runner level before execution.
  - The persisted `generationPlan.integrationPlan` must include stable contract-level surfaces for current AppSpec/generationPlan/staticContracts/buildUnitPlan version binding, synthetic test tenant and test resource plan without real tokens, public runtime API checks, creator management API checks, Agent/Workflow dry-run fixture expectations, plugin sandbox smoke expectations with explicit empty reason when no plugin is planned, Gate 3 dependency artifacts, acceptance scenario coverage, requirement coverage, orchestration coverage, trace artifacts, and failure capture fields.
  - Gate 4 checks must validate that `integrationPlan` binds the current AppSpec, generationPlan, staticContracts, and buildUnitPlan versions; marks `executionLevel` as an allowed Gate 4 execution level; uses only synthetic test resources and contains no real public share token/API key/secret; keeps all resource/artifact/fixture paths workspace-relative without host absolute paths or traversal; binds public runtime API checks to current public input/output/submission persistence static contracts; models creator-side generation run/gate run/submission query checks; keeps public runtime checks on `/generated-apps/public/{token}` and creator checks on `/generated-apps/{appId}` without boundary crossover; covers orchestration nodes/edges/input-output mappings, dry-run fixtures, plugin smoke expectations, Gate 3 build/unit artifacts, requirement/scenario/orchestration coverage, trace artifacts, and failure capture fields; and rejects dangling requirement, scenario, orchestration node, static contract, build artifact, plugin tool, API check, coverage target, and trace artifact references as well as illegal artifact/check kinds.
  - In `real-local-integration` mode, Gate 4 must run a deterministic local integration executor that does not execute arbitrary shell commands or user paths. It must build and validate public runtime read/submit/submission-detail payload contracts from `AppSpec` and `staticContracts`; validate creator generation-run/gate-run/submission query response whitelists without public tokens, source absolute paths, or internal permission details; redact any rejected internal response field, token-like value, host absolute path, Windows drive path, or traversal fragment before writing evidence/failure summaries; represent Agent/Workflow dry-run and plugin smoke through controlled local trace fixtures that explicitly state they are not production sandbox runs and not real Extism/WASM execution; and store evidence with `requestId`, `method`, `pathTemplate`, `responseStatus`, `responseBodySummary`, `durationMs`, trace artifact refs, requirement/scenario/staticContract coverage, and boundary metadata.
  - In `fixture-integration` mode, Gate 4 evidence may pass only as fixture trace shape validation, must set `executed=false`, and must not be described as a real integration pass. In `disabled-integration` mode, Gate 4 must fail and stop Gate 5-7.
  - Gate 4 gate run evidence, summary, failure message/details, and repair instructions must distinguish `integration-skeleton`, `fixture-integration`, and `real-local-integration`. Real-local Gate 4 evidence proves only the controlled deterministic local contract runner; it does not prove a production sandbox run, real Agent/Workflow sandbox execution, or real plugin WASM/Extism smoke test.
  - If Gate 4 passes, the runner must deterministically derive `generationPlan.browserAcceptancePlan` from `AppSpec + generationPlan + staticContracts + buildUnitPlan + integrationPlan`, persist the attempted browser acceptance plan inside `generated_apps.generation_plan`, execute the deterministic Gate 5 browser acceptance plan completeness/safety check, invoke the configured Gate 5 browser acceptance runner when the plan is complete, and write one linked `generated_app_gate_runs` row for `gate-5`.
  - The Gate 5 browser acceptance runner is selected by `GENERATED_APP_GATE5_EXECUTOR_MODE` or `APP_GENERATED_APP_GATE5_EXECUTOR_MODE`; supported modes are `real`, `fixture`, and `disabled`. The persisted `generationPlan.browserAcceptancePlan.executionLevel` must be one of `browser-acceptance-skeleton | real-local-browser-contract | fixture-browser-acceptance | disabled-browser-acceptance` and must match the configured runner level before execution.
  - The persisted `generationPlan.browserAcceptancePlan` must include stable contract-level surfaces for current AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan version binding, the configured execution level, a browser tool plan without real token access, desktop and mobile viewport matrix, public runtime journeys (open public runtime, fill/interact, submit, wait/read result, read submission detail) bound to acceptance scenarios, requirements, public runtime API checks and static contracts, creator management journeys for generation run/gate run/submission list/detail review, console assertions, network assertions, accessibility/interaction assertions, responsive/layout assertions, screenshot/video/trace/log artifact expectations referencing Gate 4 trace artifacts, acceptance scenario coverage, requirement coverage, journey coverage, and failure capture fields. For `real-local-browser-contract`, `browserToolPlan.runner` must be `local-browser-contract`, the command must be the fixed descriptor `agentloom generated-app gate-5 local-browser-contract`, and `workingDirectory` must be generated-run relative.
  - Gate 5 checks must validate that `browserAcceptancePlan` binds the current AppSpec, generationPlan, staticContracts, buildUnitPlan, and integrationPlan versions; uses only placeholder public access values and contains no real public share token/API key/secret; defines a browser tool plan, non-empty desktop and mobile viewport coverage, public runtime journeys, creator management journeys, console/network/accessibility/responsive assertions, artifact expectations, acceptance scenario coverage, requirement coverage, journey coverage, and failure capture fields; rejects dangling requirement, scenario, static contract, Gate 4 public/creator API check, Gate 4 trace artifact, journey, viewport, assertion, and artifact references as well as illegal journey/assertion/artifact kinds; and rejects unsafe artifact paths (host absolute paths, Windows drive paths, traversal, non-`artifacts/gate-5/` paths), public journeys that reach creator/internal endpoints, creator journeys that reach public token APIs, or unsanitized console/network summary data. Gate 5 plan `passed` only means the deterministic browser acceptance plan contract is complete enough for the configured runner; it must not by itself imply a real Playwright/browser test, real screenshot/video/trace capture, real public link visit, or real end-to-end interaction executed.
  - In `real-local-browser-contract` mode, Gate 5 executes a service-controlled deterministic local DOM/accessibility/network/console contract runner. It must not execute arbitrary shell commands, user-supplied paths, Playwright, or a real browser; it must not visit real public links or capture real screenshots/videos/Playwright traces. Evidence must explicitly record `assertionId`, `journeyId`, `viewportId`, status, duration, artifact refs, console/network summaries, requirement/scenario/staticContract coverage, Gate 4 integration trace coverage, public/creator boundary metadata, and false flags for Playwright/browser/screenshot/video/trace execution. Screenshot, video, and Playwright trace artifact refs must remain non-materialized placeholders in this runner; only local contract console/network evidence may be marked as materialized.
  - In `fixture-browser-acceptance` mode, Gate 5 evidence may pass only as fixture assertion-shape validation, must set `executed=false`, and must not be described as real browser acceptance evidence. In `disabled-browser-acceptance` mode, Gate 5 must fail and stop Gate 6-7.
  - Gate 5 gate run evidence, summary, failure message/details, and repair instructions must distinguish `browser-acceptance-skeleton`, `fixture-browser-acceptance`, `disabled-browser-acceptance`, and `real-local-browser-contract`. Real-local Gate 5 evidence proves only the controlled deterministic local browser contract runner; it does not prove a Playwright run, real browser session, real screenshot/video/trace capture, real public-link visit, or full end-to-end browser execution.
  - If Gate 5 passes, the runner must deterministically derive `generationPlan.independentVerificationPlan` from `AppSpec + generationPlan + staticContracts + buildUnitPlan + integrationPlan + browserAcceptancePlan + Gate 0-5 gate evidence`, persist the attempted independent verifier plan inside `generated_apps.generation_plan`, execute the deterministic Gate 6 independent verifier plan completeness/safety check, invoke the configured Gate 6 independent verifier runner when the plan is complete, and write one linked `generated_app_gate_runs` row for `gate-6`.
  - The Gate 6 independent verifier runner is selected by `GENERATED_APP_GATE6_EXECUTOR_MODE` or `APP_GENERATED_APP_GATE6_EXECUTOR_MODE`; supported modes are `real`, `fixture`, and `disabled`. The persisted `generationPlan.independentVerificationPlan.executionLevel` must be one of `independent-verifier-skeleton | real-local-independent-verifier | fixture-independent-verifier | disabled-independent-verifier` and must match the configured runner level before execution.
  - The persisted `generationPlan.independentVerificationPlan` must include stable contract-level surfaces for current AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan version binding, the configured execution level, a fixed `verifierRunner` descriptor (`runner='local-independent-rules-verifier'`, `command='agentloom generated-app gate-6 local-independent-verifier'`, `workingDirectory='generated-run'`, `usesExternalNetwork=false`, `usesExternalModel=false`, `usesHumanReviewer=false`, `usesGenerationTranscript=false`), verifier isolation policy declaring a fresh independent context, no generation-context reuse, no generator self-attestation, no publicShareToken/real secret reads, and redacted evidence-bundle-only inputs; evidence bundle references to Gate 0-5 gate ids/evidence ids/static contracts/build-unit artifacts/integration traces/browser artifacts/coverage matrices; rubric categories for requirement coverage, scenario coverage, UI/runtime usability, Agent/Workflow behavior, plugin/permission safety, security/privacy, data persistence, public runtime boundary, failure/error states, and publish blockers; verdict schema fields for blocking findings, warnings, pass/fail decision, traceability coverage, repair suggestions, and residual risk summary; `verdictArtifact` with `artifactId='independent-verifier-verdict'`, `kind='verifier_report'`, `path='artifacts/gate-6/independent-verifier-verdict.json'`, `required=true`, boolean `materialized`, and `containsSecrets=false`; independence checks for reviewer identity/context isolation, input redaction, generator self-attestation rejection, and evidence id citation; requirementCoverage, scenarioCoverage, evidenceCoverage, gateCoverage, and failureCaptureFields.
  - Gate 6 checks must validate that `independentVerificationPlan` binds the current AppSpec, generationPlan, staticContracts, buildUnitPlan, integrationPlan, and browserAcceptancePlan versions; marks an allowed execution level; uses only redacted evidence bundle inputs and contains no real public share token/API key/secret; uses the fixed local verifier descriptor with external network/model/human/generation-transcript access disabled; covers every required verifier isolation control, Gate 0-5 gate/evidence reference, static contract, build/unit artifact, integration trace artifact, browser artifact, coverage matrix reference, rubric category, verdict schema field/severity/decision value, verdict artifact field, independence check, requirement/scenario/evidence/gate coverage row, and failure capture field; and rejects dangling requirement, scenario, gate, evidence, static contract, build artifact, integration trace, browser artifact, rubric, verdict, artifact, and coverage references as well as illegal execution level, rubric category, verdict field, finding severity, decision value, independence check kind, coverage matrix id/source, and empty arrays.
  - In `real-local-independent-verifier` mode, Gate 6 executes a service-controlled deterministic local independent-rules verifier. It must not call external network, arbitrary models, or human reviewers; it must not read generation transcripts, public share tokens, authorization headers, API keys, secrets, host absolute paths, Windows drive paths, or traversal paths; it must reject generator self-attestation. It reads only the redacted evidence bundle, Gate 0-5 evidence refs, rubric, and coverage matrices, and it outputs a verdict schema with `blockingFindings`, `warnings`, `decision`, `traceabilityCoverage`, `repairSuggestions`, and `residualRiskSummary`. Every blocking finding and warning must cite known Gate 0-5 evidence ids. The evidence id is `gate-6-independent-verifier-verdict`, and details must record `realLocalIndependentRulesVerdict=true`, `externalModelExecuted=false`, `humanReviewExecuted=false`, `networkAccessed=false`, and `generationTranscriptRead=false`. This is a real local verifier contract runner, not an external model review, independent agent review, or human review.
  - In `fixture-independent-verifier` mode, Gate 6 may pass only as fixture verdict-shape validation, must set `executed=false`, and must not be described as a real independent verifier verdict. In `disabled-independent-verifier` mode, Gate 6 must fail and stop Gate 7.
  - Gate 6 gate run evidence, summary, failure message/details, and repair instructions must distinguish `independent-verifier-skeleton`, `fixture-independent-verifier`, `disabled-independent-verifier`, and `real-local-independent-verifier`. Real-local Gate 6 evidence proves only the controlled deterministic local rules verifier; it does not prove an external independent model review, independent agent review, human review, or full runtime-result judgment.
  - If Gate 6 passes, the runner must deterministically derive `generationPlan.publishCandidatePlan` from `AppSpec + generationPlan + staticContracts + buildUnitPlan + integrationPlan + browserAcceptancePlan + independentVerificationPlan + Gate 0-6 gate evidence`, persist the attempted publish candidate contract plan inside `generated_apps.generation_plan`, execute the configured Gate 7 publish-candidate contract runner, and write one linked `generated_app_gate_runs` row for `gate-7`.
  - The Gate 7 publish-candidate runner is selected by `GENERATED_APP_GATE7_EXECUTOR_MODE` or `APP_GENERATED_APP_GATE7_EXECUTOR_MODE`; supported modes are `real`, `fixture`, and `disabled`. The persisted `generationPlan.publishCandidatePlan.executionLevel` must be one of `publish-candidate-guard-skeleton | real-local-publish-candidate-contract | fixture-publish-candidate-contract | disabled-publish-candidate-contract` and must match the configured runner level before execution.
  - The persisted `generationPlan.publishCandidatePlan` must include stable publish-candidate contract surfaces for current AppSpec/generationPlan/staticContracts/buildUnitPlan/integrationPlan/browserAcceptancePlan/independentVerificationPlan version binding, publish readiness inputs with Gate 0-7 gate ids, Gate 0-6 evidence ids, readiness preconditions, and required non-skeleton evidence classes, artifact release manifest entries for frontend artifacts, plugin bundle artifacts or no-plugin placeholder, test reports, integration traces, browser artifacts, verifier report placeholder, and source artifact placeholder, checksum placeholders, `archiveMaterialized=false`, `signature.status='not-signed'`, artifact signoff status, rollback/share controls with `publicTokenCreation='deferred-until-enable-public-share'`, `createdPublicShareToken=null`, `publicShareSignoff='deferred-until-enable-public-share'`, `createsPublicShareToken=false`, final verdict schema, requirementCoverage, gateCoverage, artifactCoverage, and failureCaptureFields.
  - Gate 7 checks must validate that `publishCandidatePlan` binds the current AppSpec, generationPlan, staticContracts, buildUnitPlan, integrationPlan, browserAcceptancePlan, and independentVerificationPlan versions; marks an allowed execution level; covers all required Gate 0-7 gate ids and Gate 0-6 evidence refs; keeps required arrays non-empty; uses only allowed artifact kinds and blocker categories; rejects unknown final verdict fields; keeps `containsSecrets=false`; keeps public share creation deferred and `createdPublicShareToken=null`; covers every requirement/gate/artifact/failure capture contract; rejects dangling requirement, scenario, gate, evidence, artifact, blocker, verifier, and public-share-control references; and rejects any real `publicShareToken`, API key, Bearer token, secret, host absolute path, Windows drive path, traversal segment, or internal config reference in the plan or evidence.
  - In `real` mode, Gate 7 executes a service-controlled deterministic local publish-candidate contract runner. It must not execute arbitrary shell commands, user-supplied paths, production publish, artifact upload/archive creation, real signing, external verifier calls, or public share token creation. It must validate that Gate 0-6 are passed, Gate 3-6 execution levels are `real-local-command-plan`, `real-local-integration`, `real-local-browser-contract`, and `real-local-independent-verifier`, the release manifest cites Gate 0-6 evidence ids, artifact refs are safe placeholders, rollback/public-share controls are deferred, no `publicShareToken` is retained or created, and `finalVerdict.publishCandidateAllowed=true` has no blockers. Passing Gate 7 means the app can become `publish_candidate`; it does not mean `published`, and it does not create a public token.
  - In `fixture` mode, Gate 7 must fail as fixture-only publish-candidate contract validation with `executed=false` and must not be described as a real publish candidate. In `disabled` mode, Gate 7 must fail and stop the generation run. Fixture or disabled Gate 7 evidence must never make readiness `publish_candidate`.
  - When Gate 3, Gate 4, Gate 5, or Gate 6 use fixture/disabled/skeleton execution levels, Gate 7 must treat that upstream gate as non-real even if its status is `passed` and must block publish candidate. When Gate 3-6 are all real-local and the real Gate 7 runner passes, Gate 7 is recorded as `passed`, the generation run may be `passed`, readiness becomes `publish_candidate`, `publicShareToken` remains `null`, and public sharing still requires a later explicit `POST /generated-apps/:appId/public-share` readiness-guarded action.
  - After a synchronous generation run records a real passed Gate 7 result, the service creates or reuses a tenant-scoped draft Workflow editor handoff and writes its id to `generated_apps.workflow_definition_id`. This handoff is only for the creator to open the existing Workflow professional editor after the Generated App becomes a publish candidate.
  - The editor handoff Workflow must remain `status='draft'`, use metadata `source='generated-app-editor-handoff'`, `generatedAppId=<app id>`, `bindingKind='editor-handoff-draft'`, `createdFromGate='gate-7'`, and explicit publish/public-runtime boundary text. Its description must state that it is an editor handoff draft, not a published resource and not the resource executed by the public runtime.
  - Handoff creation is gated by the actual Gate 7 runner result. Failed, fixture-only, disabled, skeleton, malformed, or downgraded Gate 7 paths must not create or bind a draft Workflow.
  - Reruns must be idempotent. If `workflowDefinitionId` is already present, keep it. If it is missing, look for an existing Workflow in the same tenant with metadata `source='generated-app-editor-handoff'` and the same `generatedAppId`, then bind that id instead of inserting another Workflow. Existing Agent bindings do not suppress the Workflow handoff; `agentDefinitionId` and `workflowDefinitionId` are independent resource bindings.
  - Workflow handoff slug collisions are handled as a retryable uniqueness conflict. Before changing the slug and trying another insert, the service must re-check the metadata binding for the same tenant and Generated App so concurrent reruns can converge on the same draft Workflow instead of creating duplicates.
  - The draft handoff graph must use current Workflow editor-compatible node/edge shapes: a `manual-trigger` source with `exec-out` and `payload-out`, a `text` note source with `text-out`, a `text-output` sink with `exec-in` and `content-in`, `smart` edges between matching handles, and a canonical `inputSchema` with `version=1`, `collectionMode='form'`, and at least one required text field.
  - Public runtime responses and public submission responses must not expose `workflowDefinitionId`, `agentDefinitionId`, handoff Workflow metadata, public tokens, source artifacts, test reports, Gate evidence, or any professional editor URL. These ids are creator-side fields only.
  - Gate 7 failure must retain the attempted `generationPlan.publishCandidatePlan`, write failure evidence and repair instructions, keep readiness non-publishable, and clear stale public share state (`publicShareEnabled=false`, `publicShareToken=null`). Malformed publish-candidate plans must fail before runner execution and redact sensitive values from evidence and failure details.
  - If Gate 1 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 1 plan failure, Gate 2 must not run, and `generationPlan.staticContracts` must not be generated.
  - If Gate 2 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 2 static-contract failure, the attempted `generationPlan.staticContracts` must be retained for repair, Gate 3 must not run, and `generationPlan.buildUnitPlan` must not be generated.
  - If Gate 3 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 3 build/unit plan, workspace materialization, disabled executor, or command failure, the attempted `generationPlan.buildUnitPlan` must be retained for repair, and Gate 4 must not run or refresh `generationPlan.integrationPlan`.
  - If Gate 4 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 4 integration plan or runner failure, the attempted `generationPlan.integrationPlan` must be retained for repair, Gate 5-7 must stay not passed, and any stale public share token must be cleared.
  - If Gate 5 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 5 browser acceptance plan or runner failure, the attempted `generationPlan.browserAcceptancePlan` must be retained for repair, Gate 6-7 must stay not passed, and any stale public share token must be cleared.
  - If Gate 6 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 6 independent verifier plan or runner failure, the attempted `generationPlan.independentVerificationPlan` must be retained for repair, Gate 7 must not run, `generationPlan.publishCandidatePlan` must not be generated or refreshed, and any stale public share token must be cleared.
  - The skeleton must recompute `generated_apps.gate_results/readiness/status` through the same readiness helper as gate run recording. If any blocking gate remains pending/skipped/running/failed, `canCreatePublicShare=false`.
  - When the skeleton starts from a previously publishable or published app, the current Gate 7 guard result must be represented as not passed unless real non-skeleton execution evidence exists, so the app cannot remain or become `publish_candidate` from stale evidence.
  - If skeleton readiness is not publishable, it must disable public sharing, clear `public_share_token`, and set `public_share_disabled_at`. Gate evidence and failure details must not contain `publicShareToken` or other sensitive tokens.
- Repair attempt ledger:
  - Repair attempts are nested under one generation run and must be scoped by `tenant_id + generated_app_id + generation_run_id`.
  - Create must first resolve the generation run in the same tenant/app scope before inserting.
  - List is ordered by `created_at desc` and supports optional `status` and `targetGateId` filters.
  - Update is scoped by `tenant_id + generated_app_id + generation_run_id + repair_attempt_id`; missing rows return `GeneratedAppRepairAttemptNotFoundException`.
  - Gate run records may link back to repair attempts to prove which verification run closed or re-failed a repair.
- Public response must expose only end-user runtime surface:
  - `token`, `appId`, `title`, `description`, `dataUseNotice`, limited `appSpec`, `runtimeSurface`, `runtimeForm`, `createdAt`.
  - `runtimeForm` is a safe public form/interface descriptor derived from `AppSpec` and, when present, `generationPlan.staticContracts.publicRuntime.input.requiredFields`.
  - `runtimeForm` may expose only `formId`, `title`, `description`, `submitLabel`, `sections[]`, `fields[]`, and `resultView`. Sections may expose only `id`, `title`, `description`, and `fieldIds`. Fields may expose only `id`, `label`, `type`, `required`, `placeholder`, `helpText`, `options`, `min`, `max`, and `step`. Options may expose only `value` and `label`. Result view may expose only `title`, `description`, `emptyState`, `successTitle`, and `nextStepHint`.
  - Runtime form field types are a conservative subset: `text`, `textarea`, `single_select`, `multi_select`, `number`, and `range`.
  - Medical, TCM, or inquiry-style apps must derive intake fields such as chief complaint, duration, symptoms, severity, prior care, medical history, and notes. They must not derive diagnosis, prescription, medication dosage, treatment plan, or medical-advice fields from static contracts.
  - Do not expose `gateResults`, `readiness`, `generationPlan`, `sourceArtifactUrl`, `testReportUrl`, `pluginIds`, `publicShareToken`, or creator-only pages.
- Public submissions:
  - `POST /generated-apps/public/:token/submissions` accepts `{ anonymousSessionId?, input?, clientContext? }`.
  - `anonymousSessionId` is optional and generated server-side when omitted, blank, token-like, or host-path-like; it must not imply an authenticated end-user account and must not echo a caller-supplied secret-looking identifier.
  - `input` defaults to `{}` and is the only end-user payload persisted by the minimal backend slice; `clientContext` may be ignored or stored only in a non-privileged metadata field. Before persistence, runtime input must be normalized through the public runtime sanitizer so token-like fields, secret-like values, absolute host paths, and unsupported prototype-pollution keys cannot be echoed back to public or creator responses.
  - The service must resolve the current app by `public_share_token + public_share_enabled=true + status='published'`, then apply the same readiness assertion used by public share enable/read.
  - The insert must use the app's `tenant_id`, current `app_spec.version`, and the current token snapshot as `public_share_token`.
  - Minimal runtime does not start an AI worker, Workflow execution, production sandbox, or plugin call. Instead, `createPublicSubmission()` synchronously runs a deterministic local generated-app runtime evaluator based on `appSpec`, the safe public-runtime contract summary from `generationPlan.staticContracts` when available, and sanitized submitted input.
  - Successful minimal runtime submissions are inserted directly as `status='completed'` with non-null `result` and `report`. Both outputs must identify `runtimeKind='local-generated-app-deterministic-report'`, include app name/user goal, input summary, matched requirements, acceptance scenario coverage, deterministic next-step questions or follow-up prompts, report sections, `createdAt`, and a runtime notice that the output is local deterministic report generation rather than AI/Workflow/plugin execution.
  - Medical or inquiry-style submissions may produce structured intake summaries and next-step questions, but must not provide diagnosis, prescription, treatment instructions, or claims of professional medical advice.
  - Inputs whose structure cannot be safely handled by the local evaluator are still persisted as a submission with sanitized input, `status='failed'`, `result/report=null`, and a generic `error_message` that does not leak internal validation details or sensitive values.
  - Public submission responses expose only `id`, `appId`, `appSpecVersion`, `status`, `anonymousSessionId`, `input`, `result`, `report`, `errorMessage`, `createdAt`, and `updatedAt`.
  - Public submission responses must not expose `tenantId`, `publicShareToken`, `readiness`, gate evidence, source/test artifacts, plugins, or creator-only app data.
- Public submission detail:
  - `GET /generated-apps/public/:token/submissions/:submissionId` must first resolve the current public app by the current token and readiness.
  - The submission lookup must match `generated_app_id + public_share_token + submission_id + deleted_at is null`.
  - Closing or regenerating a public link makes old tokens unable to resolve the app; a new token also cannot read submissions captured under the old token snapshot.
- Creator submission management:
  - Creator list/detail/delete endpoints use tenant-aware DB access and must filter by `tenant_id + generated_app_id + deleted_at is null`.
  - Creator list is ordered by `created_at desc` and returns the standard paginated `{ data, meta }` envelope; `status` may filter by submission status.
  - Creator response may include `tenantId` and `publicShareToken` because those are audit fields for the owning tenant.
  - Delete operations are soft deletes only: set `deleted_at` and `updated_at`; never hard-delete individual submission rows from application service code.
  - Batch delete accepts `{ ids: string[] }` and returns `{ deletedCount }` for records actually soft-deleted in the current tenant/app scope.

### 4. Validation & Error Matrix

| Condition                                                                                                                      | Required behavior                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty or oversize prompt                                                                                                       | Reject DTO validation before service logic                                                                                                                                                                                                                                                                                                                                                        |
| `appId` is not UUID                                                                                                            | Controller rejects with `ParseUUIDPipe`                                                                                                                                                                                                                                                                                                                                                           |
| App not found in tenant scope                                                                                                  | Return `GeneratedAppNotFoundException`                                                                                                                                                                                                                                                                                                                                                            |
| Blocking gates are pending/running/skipped                                                                                     | Readiness is `preview`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                                                                |
| Blocking gate failed                                                                                                           | Readiness is `blocked`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                                                                |
| Non-blocking warning remains                                                                                                   | Readiness is `trial`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                                                                  |
| All blocking gates pass and no warning remains                                                                                 | Readiness is `publish_candidate`; public share can be enabled                                                                                                                                                                                                                                                                                                                                     |
| Gate update downgrades readiness below publish candidate                                                                       | Disable public link and clear old token                                                                                                                                                                                                                                                                                                                                                           |
| Gate run uses a non-canonical gate id                                                                                          | Reject DTO validation or domain validation before insert                                                                                                                                                                                                                                                                                                                                          |
| Gate run is recorded for a missing app                                                                                         | Return `GeneratedAppNotFoundException` and do not insert evidence                                                                                                                                                                                                                                                                                                                                 |
| Gate run records `failed` for a blocking gate                                                                                  | Insert run evidence, update current gate result to `failed`, recompute readiness to `blocked`, and clear public share token                                                                                                                                                                                                                                                                       |
| Gate run records `running`, `skipped`, or `warning` for a blocking gate                                                        | Insert run evidence, recompute readiness to non-publishable state, and clear public share token                                                                                                                                                                                                                                                                                                   |
| Gate run records `passed` but other blocking gates are still not passed                                                        | Keep readiness in `preview` and keep public share disabled                                                                                                                                                                                                                                                                                                                                        |
| Gate run records all blocking gates as `passed` but lacks trusted Gate 7 real-local publish-candidate evidence                  | Service-side publish candidate evidence guard must downgrade Gate 7 to `failed`, recompute readiness to `blocked`, keep status `failed`, and clear public share token                                                                                                                                                                                                                             |
| Gate run references another app's generation run or repair attempt                                                             | Return not found for the referenced ledger row and do not insert gate evidence                                                                                                                                                                                                                                                                                                                    |
| Synchronous runner starts for a missing or cross-tenant app                                                                    | Return `GeneratedAppNotFoundException` and do not insert generation or gate run rows                                                                                                                                                                                                                                                                                                              |
| Synchronous runner Gate 0 passes, Gate 1 passes, Gate 2 passes, Gate 3 passes, Gate 4 passes, Gate 5 passes, and Gate 6 passes | Insert linked passed Gate 0, Gate 1, Gate 2, Gate 3, Gate 4, Gate 5, and Gate 6 evidence, persist deterministic `generationPlan.staticContracts`, `generationPlan.buildUnitPlan`, `generationPlan.integrationPlan`, `generationPlan.browserAcceptancePlan`, and `generationPlan.independentVerificationPlan`, then persist attempted `generationPlan.publishCandidatePlan` and execute Gate 7. If Gate 3-6 are real-local and Gate 7 is in `real` mode, insert linked passed Gate 7 publish-candidate contract evidence, mark the generation run passed, recompute readiness to `publish_candidate`, and keep `publicShareToken=null`. If Gate 7 is fixture/disabled or upstream evidence is non-real, keep the generation run failed/non-publishable and clear any active public token. |
| Synchronous runner Gate 0 fails                                                                                                | Insert linked failed Gate 0 evidence, do not execute Gate 1 or Gate 2, do not refresh `generationPlan` or static contracts, mark the generation run failed, set readiness to blocked, and clear any active public token                                                                                                                                                                           |
| Synchronous runner Gate 1 fails                                                                                                | Insert linked passed Gate 0 evidence and failed Gate 1 evidence, persist the attempted `generationPlan`, do not execute Gate 2, do not refresh static contracts, mark the generation run failed with the Gate 1 failure reason, set readiness to blocked, and clear any active public token                                                                                                       |
| Synchronous runner Gate 2 fails                                                                                                | Insert linked passed Gate 0 and Gate 1 evidence plus failed Gate 2 evidence, persist the attempted `generationPlan.staticContracts`, do not execute Gate 3, do not refresh `generationPlan.buildUnitPlan`, mark the generation run failed with the Gate 2 failure reason, set readiness to blocked, and clear any active public token                                                             |
| Synchronous runner Gate 3 fails                                                                                                | Insert linked passed Gate 0, Gate 1, and Gate 2 evidence plus failed Gate 3 evidence, persist the attempted `generationPlan.buildUnitPlan`, do not refresh `generationPlan.integrationPlan`, mark the generation run failed with the Gate 3 failure reason, set readiness to blocked, keep Gate 4-7 not passed, and clear any active public token                                                 |
| Synchronous runner Gate 4 fails                                                                                                | Insert linked passed Gate 0, Gate 1, Gate 2, and Gate 3 evidence plus failed Gate 4 evidence, persist the attempted `generationPlan.integrationPlan`, mark the generation run failed with the Gate 4 integration skeleton failure reason, set readiness to blocked, keep Gate 5-7 not passed, and clear any active public token                                                                   |
| Synchronous runner Gate 5 fails                                                                                                | Insert linked passed Gate 0, Gate 1, Gate 2, Gate 3, and Gate 4 evidence plus failed Gate 5 evidence, persist the attempted `generationPlan.browserAcceptancePlan`, mark the generation run failed with the Gate 5 browser acceptance plan or runner failure reason, set readiness to blocked, keep Gate 6-7 not passed, and clear any active public token                                           |
| Synchronous runner Gate 6 fails                                                                                                | Insert linked passed Gate 0, Gate 1, Gate 2, Gate 3, Gate 4, and Gate 5 evidence plus failed Gate 6 evidence, persist the attempted `generationPlan.independentVerificationPlan`, mark the generation run failed with the Gate 6 independent verifier plan or runner failure reason, set readiness to blocked, do not execute Gate 7, do not generate or refresh `generationPlan.publishCandidatePlan`, and clear any active public token                                  |
| Generation run update misses tenant/app scope                                                                                  | Return `GeneratedAppGenerationRunNotFoundException`                                                                                                                                                                                                                                                                                                                                               |
| Repair attempt create references a missing generation run                                                                      | Return `GeneratedAppGenerationRunNotFoundException` and do not insert repair attempt                                                                                                                                                                                                                                                                                                              |
| Repair attempt update misses tenant/app/run scope                                                                              | Return `GeneratedAppRepairAttemptNotFoundException`                                                                                                                                                                                                                                                                                                                                               |
| Creator disables public share                                                                                                  | Disable link and clear old token; old URL must immediately stop working                                                                                                                                                                                                                                                                                                                           |
| Creator regenerates public share                                                                                               | Replace token; old URL must immediately stop working                                                                                                                                                                                                                                                                                                                                              |
| Public token is missing, disabled, or not `published`                                                                          | Public endpoint returns not found                                                                                                                                                                                                                                                                                                                                                                 |
| Public token is missing, disabled, stale, or old after rotation                                                                | Public endpoint returns not found without echoing the submitted token in the public error detail                                                                                                                                                                                                                                                                                                   |
| Public app readiness no longer allows publish candidate                                                                        | Public endpoint rejects rather than serving stale runtime                                                                                                                                                                                                                                                                                                                                         |
| Public submission token is stale, disabled, or not `published`                                                                 | Public submit/detail returns not found before touching submissions                                                                                                                                                                                                                                                                                                                                |
| Public submission app readiness is no longer publish candidate                                                                 | Public submit/detail returns 409 and does not insert/read submission data                                                                                                                                                                                                                                                                                                                         |
| Public submit omits `anonymousSessionId`                                                                                       | Generate an opaque server-side anonymous session id and persist it                                                                                                                                                                                                                                                                                                                                |
| Public submit omits `input`                                                                                                    | Persist `{}`                                                                                                                                                                                                                                                                                                                                                                                      |
| Public submit includes `clientContext`                                                                                         | Ignore it or store it only in non-privileged metadata; never use it for tenant/app/user authorization                                                                                                                                                                                                                                                                                             |
| Public submission detail uses a different current token                                                                        | Return not found because `public_share_token` snapshot must match                                                                                                                                                                                                                                                                                                                                 |
| Public submission row has `deleted_at`                                                                                         | Return not found                                                                                                                                                                                                                                                                                                                                                                                  |
| Creator list/detail sees rows from another tenant, another app, or soft-deleted rows                                           | Exclude them by SQL filters                                                                                                                                                                                                                                                                                                                                                                       |
| Creator single delete misses the row in tenant/app scope                                                                       | Return `GeneratedAppSubmissionNotFoundException`                                                                                                                                                                                                                                                                                                                                                  |
| Creator batch delete includes unknown, duplicate, cross-tenant, cross-app, or already-deleted IDs                              | Ignore non-matching rows and return the actual `deletedCount`                                                                                                                                                                                                                                                                                                                                     |

### 5. Good / Base / Bad Cases

- Good: the synchronous runner writes linked Gate 0, Gate 1, Gate 2, Gate 3, Gate 4, Gate 5, Gate 6, and Gate 7 evidence when earlier gates pass, persists a structured architecture `generationPlan` plus `generationPlan.staticContracts`, `generationPlan.buildUnitPlan`, `generationPlan.integrationPlan`, `generationPlan.browserAcceptancePlan`, `generationPlan.independentVerificationPlan`, and attempted `generationPlan.publishCandidatePlan`, lets Gate 7 pass only in `real-local-publish-candidate-contract` mode with Gate 3-6 real-local upstream evidence, moves readiness to `publish_candidate` without creating a public token, and keeps Gate 7 failed/non-publishable when Gate 7 is fixture/disabled or upstream evidence is fixture/disabled/skeleton.
- Good: Gate 3 real-local evidence clearly says the controlled Generation Workspace was materialized and records command, exitCode, stdout/stderr summary, artifact refs, and requirement/scenario coverage for build/typecheck/unit/component-golden commands.
- Good: Gate 3 fixture evidence clearly says commands were not executed and cannot be used as a real build/test pass.
- Good: Gate 4 real-local evidence clearly says the controlled deterministic local contract runner executed public runtime, creator query, Agent/Workflow local trace fixture, and plugin local smoke trace fixture checks, and also says it is not proof of production sandbox execution or real plugin WASM/Extism execution.
- Good: Gate 5 real-local evidence clearly says the controlled deterministic local DOM/accessibility/network/console contract runner executed and records assertionId, journeyId, viewportId, status, durationMs, artifact refs, console/network summaries, requirement/scenario/staticContract coverage, and Gate 4 trace coverage; it also says it is not proof of a Playwright run, real browser session, real screenshot/video/trace capture, real public-link visit, or full end-to-end browser execution.
- Good: Gate 5 fixture/disabled/skeleton evidence clearly says it is not real browser acceptance evidence and cannot be used as a real browser pass.
- Good: Gate 6 real-local evidence clearly says the controlled deterministic local independent-rules verifier executed, records verdict decision, traceability coverage, repair suggestions, residual risk summary, and false external model/network/human/generation-transcript flags, and also says it is not proof of an external independent model review, independent agent review, or human review.
- Good: Gate 6 fixture/disabled/skeleton evidence clearly says it is not a real independent verifier verdict and cannot be used as a release signoff.
- Good: Gate 7 real-local evidence clearly says the controlled deterministic local publish-candidate contract runner signed off a release manifest contract, checksum placeholders, Gate 0-6 evidence citations, and deferred public-share controls, and also says it did not create a production publish, artifact archive, real signature, external verifier result, or public share token.
- Good: after Gate 7 real-local passes, service returns `publish_candidate` and `POST /generated-apps/:appId/public-share` creates a fresh 64-hex-character token only through the explicit readiness-guarded public-share action.
- Base: newly created prompt generates an AppSpec draft and can synchronously produce Gate 0 + Gate 1 + Gate 2 + Gate 3 workspace/build-unit evidence + Gate 4 integration evidence + Gate 5 browser acceptance evidence + Gate 6 real-local independent verifier verdict plus Gate 7 real-local publish-candidate contract evidence; the app is visible to the creator as `publish_candidate` but is not public until explicit public-share enable creates a token.
- Base: warning evidence exists after blocking gates pass; the app can remain in creator trial but cannot become a public runtime.
- Bad: code enables a public link while `readiness.state !== 'publish_candidate'`.
- Bad: code disables a public link but keeps the old token reusable.
- Bad: public endpoint returns creator-only fields such as gate results, test report URLs, source artifact URLs, plugin IDs, or permission details.

### 6. Tests Required

- `generated-app.gates.spec.ts`
  - pending blocker -> `preview`, `canCreatePublicShare=false`
  - failed blocker -> `blocked`, `canCreatePublicShare=false`
  - blocking all passed + non-blocking warning -> `trial`, `canCreatePublicShare=false`
  - blocking all passed + no warning -> `publish_candidate`, `canCreatePublicShare=true`
- `generated-app.service.spec.ts`
  - non-publish-candidate share enable rejects and does not update DB
  - publish candidate share enable creates a new unpredictable token
  - disable clears token
  - regenerate replaces token
  - gate downgrade disables public link and clears token
  - public response does not leak internal evidence, source, test, plugin, readiness, or token fields
  - public response includes a safe `runtimeForm` derived from AppSpec/static contracts, including text/textarea/select/multi-select/number/range descriptors, and drops internal or sensitive runtime form keys
  - public endpoint rejects stale apps that no longer satisfy publish candidate readiness
  - public submission persists under the app tenant, snapshots the current token, generates anonymous session id when omitted or unsafe, and inserts successful local deterministic runtime output as `completed` with non-null `result/report`
  - public submission rejects stale or not-ready public apps before insert
  - public submission response does not expose tenant id, public token, readiness, gates, source/test artifacts, or plugin/internal fields
  - public submission sanitizes token-like, secret-like, host-path, and unsupported input structures; unprocessable structures persist as failed submissions with generic `errorMessage`
  - stale or old public token errors do not include the submitted token value in problem details
  - creator submission list/detail filter by tenant id, app id, and `deleted_at is null`, and creator detail sees the same `status/result/report/errorMessage` persisted by public submission creation
  - single and batch delete set `deleted_at`/`updated_at` and return correct delete counts
  - public submission detail cannot read a soft-deleted submission and cannot read old-token submissions after token rotation
  - gate run recording inserts immutable attempt evidence with canonical gate snapshot fields
  - gate run recording updates current `gateResults`, `readiness`, and `status` in the owning generated app
  - failed or non-publishable gate runs clear any active public share token
  - manual gate result recording with all canonical gates marked `passed` but without trusted Gate 7 real-local publish-candidate evidence is downgraded by the publish candidate evidence guard, keeps readiness blocked, and clears active public share token
  - gate run listing filters by tenant id, app id, gate id, status, generation run id, and repair attempt id and returns paginated results
  - generation run create/list/update preserve run number, status, trigger source, repair budget, runtime budget, summary, failure reason, and timestamps
  - synchronous runner start creates a generation run and linked Gate 0 run
  - synchronous runner Gate 0 failure keeps readiness non-publishable, does not execute Gate 1, Gate 2, Gate 3, or Gate 4, does not refresh `generationPlan`, static contracts, build/unit plan, or integration plan, and clears public share token
  - synchronous runner Gate 0 + Gate 1 + Gate 2 + Gate 3 + Gate 4 + Gate 5 + Gate 6 pass creates linked Gate 0, Gate 1, Gate 2, Gate 3, Gate 4, Gate 5, Gate 6, and Gate 7 runs, persists structured `generationPlan.staticContracts`, `generationPlan.buildUnitPlan`, `generationPlan.integrationPlan`, `generationPlan.browserAcceptancePlan`, `generationPlan.independentVerificationPlan` with real-local verdict artifact metadata, and attempted `generationPlan.publishCandidatePlan`; in Gate 7 real mode with Gate 3-6 real-local, the Gate 7 run passes, generation run passes, readiness becomes `publish_candidate`, stale public sharing is cleared, and no public token is created
  - synchronous runner Gate 1 failure is covered with a malformed but non-empty `generationPlan` reference so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 2 failure is covered with malformed static contracts so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 2 failure does not execute Gate 3 and does not refresh `generationPlan.buildUnitPlan`
  - synchronous runner Gate 3 + Gate 4 + Gate 5 + Gate 6 + Gate 7 happy path stores a controlled workspace contract, command plan, real-local build/unit evidence, real-local Gate 4 integration trace evidence, real-local Gate 5 browser contract evidence, real-local Gate 6 independent verifier verdict evidence, Gate 7 release manifest contract evidence, command/output summaries, artifact refs, console/network summaries, verdict schema, and requirement/scenario/staticContract/evidence coverage while Gate 7 still avoids production artifact archive/signature/upload/public token creation.
  - synchronous runner Gate 3 failure is covered with a malformed but non-empty `generationPlan.buildUnitPlan` reference, including dangling build/unit coverage references, so completeness checks cannot regress to "field exists means passed"; Gate 4 must not run or refresh `generationPlan.integrationPlan`
  - synchronous runner Gate 3 workspace materialization failure stops Gate 4-7, keeps attempted `buildUnitPlan`, saves readable failure/repair instructions, and clears stale public sharing.
  - synchronous runner Gate 3 command failure stops Gate 4-7 and saves command id, command, exit code, stdout/stderr summary, artifact refs, and requirement/scenario coverage.
  - Gate 3 command execution rejects non-allowlisted command strings, absolute script paths, traversal working directories, and arbitrary shell execution before spawning a process.
  - Gate 3 command/materialization failures redact host absolute workspace paths from evidence and failure details.
  - Gate 7 coverage treats Gate 3 `fixture-execution`, `disabled-execution`, and `contract-skeleton` evidence as non-real upstream evidence; treats Gate 4 `fixture-integration`, `disabled-integration`, and `integration-skeleton` as non-real upstream evidence; treats Gate 5 `fixture-browser-acceptance`, `disabled-browser-acceptance`, and `browser-acceptance-skeleton` as non-real upstream evidence; treats Gate 6 `fixture-independent-verifier`, `disabled-independent-verifier`, and `independent-verifier-skeleton` as non-real upstream evidence; does not classify Gate 5 `real-local-browser-contract` or Gate 6 `real-local-independent-verifier` as skeleton-only; and allows publish candidate only when Gate 7 `real-local-publish-candidate-contract` validates the release manifest contract, Gate 0-6 evidence citations, artifact placeholders, and deferred public-share signoff.
  - synchronous runner Gate 4 failure is covered with a malformed but non-empty `generationPlan.integrationPlan` reference, including dangling requirement/scenario/orchestration node/static contract/build artifact/plugin tool/API check/coverage target references, illegal artifact/check kind, and sensitive-token redaction assertions, so completeness checks cannot regress to "field exists means passed"; Gate 5 must not run or refresh `generationPlan.browserAcceptancePlan`
  - synchronous runner Gate 4 runner failure and `disabled-integration` failure stop Gate 5-7, keep attempted `generationPlan.integrationPlan`, save trace/disabled evidence, and clear stale public sharing.
  - synchronous runner Gate 5 failure is covered with a malformed but non-empty `generationPlan.browserAcceptancePlan` reference, including dangling requirement/scenario/static contract/Gate 4 API check/Gate 4 trace artifact/journey/viewport/assertion/artifact references, illegal journey/assertion/artifact kind, empty-array completeness gaps, unsafe artifact path and public/creator endpoint boundary checks, disabled runner behavior, and sensitive-token redaction assertions, so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 6 failure is covered with a malformed but non-empty `generationPlan.independentVerificationPlan` reference, including dangling requirement/scenario/gate/evidence/static contract/build artifact/integration trace/browser artifact/rubric/verdict/artifact/coverage references, illegal execution level, rubric category, verdict field, finding severity, decision value, independence check kind, coverage matrix id/source, empty-array completeness gaps, and sensitive-token redaction assertions, so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 6 failure does not execute Gate 7 and does not refresh `generationPlan.publishCandidatePlan`
  - synchronous runner Gate 7 malformed publish-candidate contract failure is covered with a malformed but non-empty `generationPlan.publishCandidatePlan` reference, including dangling requirement/scenario/gate/evidence/artifact/blocker/verifier/public-share-control references, illegal artifact kind, blocker category, verdict field, empty-array completeness gaps, and sensitive-token redaction assertions, so completeness checks cannot regress to "field exists means passed"
  - `generated-app.publish-candidate-runner.spec.ts` covers Gate 7 real happy path, fixture/disabled not being treated as real publish candidate, unsafe artifact/evidence refs, missing release manifest citations, missing real upstream gates, and no public token creation
  - synchronous runner missing/cross-tenant app returns `GeneratedAppNotFoundException` before inserting ledgers
- `generated-app.integration-runner.spec.ts`
  - Gate 4 `real-local-integration` executes deterministic local public runtime read/submit/detail checks, creator query whitelist checks, Agent/Workflow local trace fixtures, and plugin smoke trace fixtures without arbitrary shell or user paths.
  - Gate 4 `fixture-integration` marks trace shape validation as `executed=false` and never presents itself as real integration evidence.
  - Gate 4 `disabled-integration` fails and blocks Gate 5-7.
  - Gate 4 runner rejects unsafe workspace-relative paths, host absolute paths, traversal, execution-level mismatch, and public/creator API boundary crossover before execution.
  - Gate 4 runner returns `gate-4-integration-check-failed` when a controlled local contract check response does not match the expected status or whitelist contract.
  - Gate 4 runner fails public runtime read evidence when `runtimeForm` contains non-whitelisted keys, public tokens, source/test artifact fields, plugin fields, host paths, or secret-like values.
- `generated-app.browser-acceptance-runner.spec.ts`
  - Gate 5 `real-local-browser-contract` executes deterministic local DOM/accessibility/network/console contract checks without arbitrary shell, user paths, Playwright, real browser sessions, or real screenshot/video/trace capture.
  - Gate 5 `fixture-browser-acceptance` marks assertion evidence as `executed=false` and never presents itself as real browser acceptance evidence.
  - Gate 5 `disabled-browser-acceptance` fails and blocks Gate 6-7.
  - Gate 5 runner rejects unsafe artifact paths, execution-level mismatch, public journey access to creator/internal endpoints, and creator journey access to public token APIs before execution.
  - Gate 5 runner writes redacted console/network summaries and refuses evidence that still contains token-like values, host absolute paths, Windows drive paths, or traversal fragments.
  - Gate 5 real evidence carries assertionId, journeyId, viewportId, status, durationMs, artifact refs, console/network summaries, requirement/scenario/staticContract coverage, Gate 4 integration trace coverage, and browser/Playwright/screenshot/video/trace false execution flags; screenshot/video/Playwright trace refs are never marked materialized by the local contract runner.
- `generated-app.independent-verifier-runner.spec.ts`
  - Gate 6 `real-local-independent-verifier` executes deterministic local rules against only redacted Gate 0-5 evidence and returns `blockingFindings`, `warnings`, `decision`, `traceabilityCoverage`, `repairSuggestions`, and `residualRiskSummary`.
  - Gate 6 `fixture-independent-verifier` marks `executed=false` and never presents itself as a real independent verifier verdict.
  - Gate 6 `disabled-independent-verifier` fails and blocks Gate 7.
  - Gate 6 runner rejects generation transcript, public share token/API key/secret, host absolute path, Windows drive path, traversal, execution-level mismatch, external network/model/human flags, generator self-attestation, and verdict findings without Gate 0-5 evidence id citations.
- repair attempt create/list/update preserve parent generation run, target gate, attempt number, failure summary, change summary, verification summary, and timestamps
- gate run recording can link to a generation run and repair attempt in the same tenant/app scope
- Run scoped lint, `tsconfig.build.json` typecheck, and targeted tests for any generated-app change.

### 7. Wrong vs Correct

Wrong:

```ts
if (app.readiness.canCreatePublicShare) {
  return servePublicApp(app);
}
```

Correct:

```ts
if (
  app.status !== "published" ||
  app.readiness.state !== "publish_candidate" ||
  !app.readiness.canCreatePublicShare
) {
  throw new GeneratedAppPublicShareNotReadyException(
    app.id,
    app.readiness.summary,
  );
}
```

Wrong:

```ts
await db.update(generatedApps).set({ publicShareEnabled: false });
```

Correct:

```ts
await db.update(generatedApps).set({
  publicShareEnabled: false,
  publicShareToken: null,
  publicShareDisabledAt: new Date(),
});
```
