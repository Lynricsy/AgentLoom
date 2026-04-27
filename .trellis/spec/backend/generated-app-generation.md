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
  - `generation_plan jsonb null`; after Gate 2 runs, the deterministic static contract skeleton is stored under `generationPlan.staticContracts`; after Gate 3 runs, the deterministic build/unit skeleton is stored under `generationPlan.buildUnitPlan`
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
  - The response returns `{ generationRun, gateRuns, app }`, where `gateRuns` contains the gate runs produced by the synchronous skeleton and `app` is the creator-side generated app after readiness sync.
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
- Gate run recording:
  - `POST /generated-apps/:appId/gate-runs` must first resolve the generated app in tenant scope.
  - Each gate run stores an immutable attempt row in `generated_app_gate_runs` with the canonical gate definition snapshot and the supplied evidence/failure/repair data.
  - If `generationRunId` is supplied, it must belong to the same tenant and generated app.
  - If `repairAttemptId` is supplied, it must belong to the same tenant and generated app; when `generationRunId` is also supplied, the repair attempt must belong to that generation run.
  - The same request must update `generated_apps.gate_results`, replacing the current summary for that canonical gate while preserving other gates through canonical normalization.
  - The request must recompute `generated_apps.readiness` and `generated_apps.status` from the full normalized gate result set.
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
- Synchronous gate runner skeleton:
  - `POST /generated-apps/:appId/generation-runs/start` must resolve the generated app in tenant scope, create a generation run, execute deterministic gates in order (`gate-0` AppSpec -> `gate-1` generation plan -> `gate-2` static contracts -> `gate-3` build/unit skeleton), and stop before the next gate when the current gate fails.
  - Gate 0 checks must validate that `AppSpec` has a usable app summary, actors, core requirements, pages/flows, data policy and scope boundary, acceptance scenarios, requirement coverage, and traceability. Failure evidence must include check labels, missing pieces, and repair instructions.
  - If Gate 0 passes, the runner must deterministically derive a structured `generationPlan` from `AppSpec`, persist it to `generated_apps.generation_plan`, execute the deterministic Gate 1 architecture-plan completeness check, and write one linked `generated_app_gate_runs` row for `gate-1`.
  - The persisted `generationPlan` must include stable fields for `appSpecVersion`, `frontend` page/runtime plan, `orchestration` Agent/Workflow plan, `pluginTools` plan with an explicit empty reason when no tools are required, `dataPersistence` plan, `testGates` plan for Gate 2-7, and requirement-level `traceability` to scenarios/pages/plan evidence.
  - Gate 1 checks must validate that the generation plan binds the current AppSpec version, covers all AppSpec pages, maps every core requirement into Agent/Workflow orchestration steps, records plugin/tool permission policy or an empty-plan reason, mirrors data persistence policy, defines Gate 2-7 test plans, and connects every core requirement to scenarios, pages, orchestration steps, and plan evidence. Traceability and plan references must point to existing AppSpec requirements/scenarios/pages, planned orchestration steps, and known plan evidence ids; non-empty but dangling references fail Gate 1.
  - If Gate 1 passes, the runner must deterministically derive `generationPlan.staticContracts` from `AppSpec + generationPlan`, persist the attempted contracts inside `generated_apps.generation_plan`, execute the deterministic Gate 2 static-contract completeness check, and write one linked `generated_app_gate_runs` row for `gate-2`.
  - The persisted `generationPlan.staticContracts` must include stable contract surfaces for public runtime input/output, frontend route/page, Workflow/Agent orchestration graph, plugin/tool permissions, public submission persistence, Gate 3-7 test entry commands, and requirement-level traceability.
  - Gate 2 checks must validate that static contracts bind the current AppSpec and generationPlan, cover public runtime inputs/outputs, every planned frontend page route and its requirement/scenario coverage, orchestration nodes/edges/handles as a DAG, plugin/tool manifest and permission hard gates for every planned tool, submission persistence fields including the public token snapshot, Gate 3-7 test entries including independent verifier and publish-candidate commands, and traceability from each core requirement to known static contract ids, scenarios, pages, and orchestration nodes.
  - If Gate 2 passes, the runner must deterministically derive `generationPlan.buildUnitPlan` from `AppSpec + generationPlan + staticContracts`, persist the attempted build/unit plan inside `generated_apps.generation_plan`, execute the deterministic Gate 3 build/unit skeleton completeness check, and write one linked `generated_app_gate_runs` row for `gate-3`.
  - The persisted `generationPlan.buildUnitPlan` must include stable contract-level surfaces for frontend build command, TypeScript typecheck command, unit test command, component/golden test entry, artifact expectations including plugin bundle artifacts when plugin tools are planned, staticContracts coverage, acceptanceScenario coverage, plugin build expectations with explicit empty reason when no plugin is planned, and failure capture fields.
  - Gate 3 checks must validate that `buildUnitPlan` binds the current AppSpec, generationPlan, and staticContracts versions; marks `executionLevel='contract-skeleton'`; covers every frontend route, core requirement, acceptance scenario, Gate 2 static contract id, required artifact expectation, plugin build expectation or explicit no-plugin reason, and required failure capture field; and rejects dangling requirement, scenario, route, static contract, coverage target, plugin tool, and artifact references. Gate 3 `passed` only means the deterministic build/unit skeleton contract is complete; it must not imply a real frontend build, plugin build, unit test, component test, or golden test was executed.
  - The skeleton must not mark Gate 4-7 as `passed`, because it does not execute integration, browser, verifier, or publish-candidate gates.
  - If Gate 0, Gate 1, Gate 2, and Gate 3 pass but Gate 4-7 are not executed, the generation run must stay conservative with `status='failed'` and `failure_reason='Gate 4-7 runner 尚未接入/未执行，不能形成 publish candidate。'`; Gate 0, Gate 1, Gate 2, and Gate 3 evidence may still be recorded as `passed`.
  - If Gate 1 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 1 plan failure, Gate 2 must not run, and `generationPlan.staticContracts` must not be generated.
  - If Gate 2 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 2 static-contract failure, the attempted `generationPlan.staticContracts` must be retained for repair, Gate 3 must not run, and `generationPlan.buildUnitPlan` must not be generated.
  - If Gate 3 fails, the generation run must stay `failed`, `failure_reason` must describe the Gate 3 build/unit skeleton failure, and the attempted `generationPlan.buildUnitPlan` must be retained for repair.
  - The skeleton must recompute `generated_apps.gate_results/readiness/status` through the same readiness helper as gate run recording. If any blocking gate remains pending/skipped/running/failed, `canCreatePublicShare=false`.
  - When the skeleton starts from a previously publishable or published app, any unexecuted canonical Gate 4-7 summaries must be represented as not passed for the current runner result, so the app cannot remain or become `publish_candidate` from stale evidence.
  - If skeleton readiness is not publishable, it must disable public sharing, clear `public_share_token`, and set `public_share_disabled_at`. Gate evidence and failure details must not contain `publicShareToken` or other sensitive tokens.
- Repair attempt ledger:
  - Repair attempts are nested under one generation run and must be scoped by `tenant_id + generated_app_id + generation_run_id`.
  - Create must first resolve the generation run in the same tenant/app scope before inserting.
  - List is ordered by `created_at desc` and supports optional `status` and `targetGateId` filters.
  - Update is scoped by `tenant_id + generated_app_id + generation_run_id + repair_attempt_id`; missing rows return `GeneratedAppRepairAttemptNotFoundException`.
  - Gate run records may link back to repair attempts to prove which verification run closed or re-failed a repair.
- Public response must expose only end-user runtime surface:
  - `token`, `appId`, `title`, `description`, `dataUseNotice`, limited `appSpec`, `runtimeSurface`, `createdAt`.
  - Do not expose `gateResults`, `readiness`, `generationPlan`, `sourceArtifactUrl`, `testReportUrl`, `pluginIds`, `publicShareToken`, or creator-only pages.
- Public submissions:
  - `POST /generated-apps/public/:token/submissions` accepts `{ anonymousSessionId?, input?, clientContext? }`.
  - `anonymousSessionId` is optional and generated server-side when omitted; it must not imply an authenticated end-user account.
  - `input` defaults to `{}` and is the only end-user payload persisted by the minimal backend slice; `clientContext` may be ignored or stored only in a non-privileged metadata field.
  - The service must resolve the current app by `public_share_token + public_share_enabled=true + status='published'`, then apply the same readiness assertion used by public share enable/read.
  - The insert must use the app's `tenant_id`, current `app_spec.version`, and the current token snapshot as `public_share_token`.
  - Minimal runtime does not start an AI worker; new submissions stay `status='received'` with `result/report/error_message = null`.
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

| Condition                                                                                                       | Required behavior                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Empty or oversize prompt                                                                                        | Reject DTO validation before service logic                                                                                                                                                                                                                                                                                                             |
| `appId` is not UUID                                                                                             | Controller rejects with `ParseUUIDPipe`                                                                                                                                                                                                                                                                                                                |
| App not found in tenant scope                                                                                   | Return `GeneratedAppNotFoundException`                                                                                                                                                                                                                                                                                                                 |
| Blocking gates are pending/running/skipped                                                                      | Readiness is `preview`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                     |
| Blocking gate failed                                                                                            | Readiness is `blocked`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                     |
| Non-blocking warning remains                                                                                    | Readiness is `trial`; public share enable/regenerate returns 409                                                                                                                                                                                                                                                                                       |
| All blocking gates pass and no warning remains                                                                  | Readiness is `publish_candidate`; public share can be enabled                                                                                                                                                                                                                                                                                          |
| Gate update downgrades readiness below publish candidate                                                        | Disable public link and clear old token                                                                                                                                                                                                                                                                                                                |
| Gate run uses a non-canonical gate id                                                                           | Reject DTO validation or domain validation before insert                                                                                                                                                                                                                                                                                               |
| Gate run is recorded for a missing app                                                                          | Return `GeneratedAppNotFoundException` and do not insert evidence                                                                                                                                                                                                                                                                                      |
| Gate run records `failed` for a blocking gate                                                                   | Insert run evidence, update current gate result to `failed`, recompute readiness to `blocked`, and clear public share token                                                                                                                                                                                                                            |
| Gate run records `running`, `skipped`, or `warning` for a blocking gate                                         | Insert run evidence, recompute readiness to non-publishable state, and clear public share token                                                                                                                                                                                                                                                        |
| Gate run records `passed` but other blocking gates are still not passed                                         | Keep readiness in `preview` and keep public share disabled                                                                                                                                                                                                                                                                                             |
| Gate run references another app's generation run or repair attempt                                              | Return not found for the referenced ledger row and do not insert gate evidence                                                                                                                                                                                                                                                                         |
| Synchronous runner starts for a missing or cross-tenant app                                                     | Return `GeneratedAppNotFoundException` and do not insert generation or gate run rows                                                                                                                                                                                                                                                                   |
| Synchronous runner Gate 0 passes, Gate 1 passes, Gate 2 passes, and Gate 3 passes but Gate 4-7 are not executed | Insert linked passed Gate 0, Gate 1, Gate 2, and Gate 3 evidence, persist deterministic `generationPlan.staticContracts` and `generationPlan.buildUnitPlan`, mark the generation run failed with the Gate 4-7-not-executed failure reason, keep Gate 4-7 not passed, recompute readiness to non-publishable preview, and clear any active public token |
| Synchronous runner Gate 0 fails                                                                                 | Insert linked failed Gate 0 evidence, do not execute Gate 1 or Gate 2, do not refresh `generationPlan` or static contracts, mark the generation run failed, set readiness to blocked, and clear any active public token                                                                                                                                |
| Synchronous runner Gate 1 fails                                                                                 | Insert linked passed Gate 0 evidence and failed Gate 1 evidence, persist the attempted `generationPlan`, do not execute Gate 2, do not refresh static contracts, mark the generation run failed with the Gate 1 failure reason, set readiness to blocked, and clear any active public token                                                            |
| Synchronous runner Gate 2 fails                                                                                 | Insert linked passed Gate 0 and Gate 1 evidence plus failed Gate 2 evidence, persist the attempted `generationPlan.staticContracts`, do not execute Gate 3, do not refresh `generationPlan.buildUnitPlan`, mark the generation run failed with the Gate 2 failure reason, set readiness to blocked, and clear any active public token                  |
| Synchronous runner Gate 3 fails                                                                                 | Insert linked passed Gate 0, Gate 1, and Gate 2 evidence plus failed Gate 3 evidence, persist the attempted `generationPlan.buildUnitPlan`, mark the generation run failed with the Gate 3 failure reason, set readiness to blocked, keep Gate 4-7 not passed, and clear any active public token                                                       |
| Generation run update misses tenant/app scope                                                                   | Return `GeneratedAppGenerationRunNotFoundException`                                                                                                                                                                                                                                                                                                    |
| Repair attempt create references a missing generation run                                                       | Return `GeneratedAppGenerationRunNotFoundException` and do not insert repair attempt                                                                                                                                                                                                                                                                   |
| Repair attempt update misses tenant/app/run scope                                                               | Return `GeneratedAppRepairAttemptNotFoundException`                                                                                                                                                                                                                                                                                                    |
| Creator disables public share                                                                                   | Disable link and clear old token; old URL must immediately stop working                                                                                                                                                                                                                                                                                |
| Creator regenerates public share                                                                                | Replace token; old URL must immediately stop working                                                                                                                                                                                                                                                                                                   |
| Public token is missing, disabled, or not `published`                                                           | Public endpoint returns not found                                                                                                                                                                                                                                                                                                                      |
| Public app readiness no longer allows publish candidate                                                         | Public endpoint rejects rather than serving stale runtime                                                                                                                                                                                                                                                                                              |
| Public submission token is stale, disabled, or not `published`                                                  | Public submit/detail returns not found before touching submissions                                                                                                                                                                                                                                                                                     |
| Public submission app readiness is no longer publish candidate                                                  | Public submit/detail returns 409 and does not insert/read submission data                                                                                                                                                                                                                                                                              |
| Public submit omits `anonymousSessionId`                                                                        | Generate an opaque server-side anonymous session id and persist it                                                                                                                                                                                                                                                                                     |
| Public submit omits `input`                                                                                     | Persist `{}`                                                                                                                                                                                                                                                                                                                                           |
| Public submit includes `clientContext`                                                                          | Ignore it or store it only in non-privileged metadata; never use it for tenant/app/user authorization                                                                                                                                                                                                                                                  |
| Public submission detail uses a different current token                                                         | Return not found because `public_share_token` snapshot must match                                                                                                                                                                                                                                                                                      |
| Public submission row has `deleted_at`                                                                          | Return not found                                                                                                                                                                                                                                                                                                                                       |
| Creator list/detail sees rows from another tenant, another app, or soft-deleted rows                            | Exclude them by SQL filters                                                                                                                                                                                                                                                                                                                            |
| Creator single delete misses the row in tenant/app scope                                                        | Return `GeneratedAppSubmissionNotFoundException`                                                                                                                                                                                                                                                                                                       |
| Creator batch delete includes unknown, duplicate, cross-tenant, cross-app, or already-deleted IDs               | Ignore non-matching rows and return the actual `deletedCount`                                                                                                                                                                                                                                                                                          |

### 5. Good / Base / Bad Cases

- Good: the synchronous runner skeleton writes linked Gate 0, Gate 1, Gate 2, and Gate 3 evidence when earlier gates pass, persists a structured architecture `generationPlan` plus `generationPlan.staticContracts` and `generationPlan.buildUnitPlan`, leaves Gate 4-7 not passed until real runners execute them, recomputes readiness to non-publishable preview, and clears stale public sharing.
- Good: Gate 3 evidence clearly says it is a deterministic build/unit skeleton completeness check and not proof that a real frontend build, plugin build, unit test, component test, or golden test was executed.
- Good: a future full gate runner writes all blocking gates as `passed`, verifier has no warning, service returns `publish_candidate`, and `POST /generated-apps/:appId/public-share` creates a 64-hex-character token.
- Base: newly created prompt generates an AppSpec draft and can synchronously produce Gate 0 + Gate 1 + Gate 2 + Gate 3 evidence, but Gate 4-7 remain pending; the app is visible to the creator but cannot create a public link.
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
  - public endpoint rejects stale apps that no longer satisfy publish candidate readiness
  - public submission persists under the app tenant, snapshots the current token, generates anonymous session id when omitted, and starts as `received`
  - public submission rejects stale or not-ready public apps before insert
  - public submission response does not expose tenant id, public token, readiness, gates, source/test artifacts, or plugin/internal fields
  - creator submission list/detail filter by tenant id, app id, and `deleted_at is null`
  - single and batch delete set `deleted_at`/`updated_at` and return correct delete counts
  - public submission detail cannot read a soft-deleted submission and cannot read old-token submissions after token rotation
  - gate run recording inserts immutable attempt evidence with canonical gate snapshot fields
  - gate run recording updates current `gateResults`, `readiness`, and `status` in the owning generated app
  - failed or non-publishable gate runs clear any active public share token
  - gate run listing filters by tenant id, app id, gate id, status, generation run id, and repair attempt id and returns paginated results
  - generation run create/list/update preserve run number, status, trigger source, repair budget, runtime budget, summary, failure reason, and timestamps
  - synchronous runner start creates a generation run and linked Gate 0 run
  - synchronous runner Gate 0 failure keeps readiness non-publishable, does not execute Gate 1, Gate 2, or Gate 3, does not refresh `generationPlan`, static contracts, or build/unit plan, and clears public share token
  - synchronous runner Gate 0 + Gate 1 + Gate 2 + Gate 3 pass creates linked Gate 0, Gate 1, Gate 2, and Gate 3 runs, persists structured `generationPlan.staticContracts` and `generationPlan.buildUnitPlan`, leaves the generation run failed with a Gate 4-7-not-executed failure reason, does not mark unexecuted Gate 4-7 as passed, clears stale Gate 4-7 evidence, and does not produce `publish_candidate`
  - synchronous runner Gate 1 failure is covered with a malformed but non-empty `generationPlan` reference so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 2 failure is covered with malformed static contracts so completeness checks cannot regress to "field exists means passed"
  - synchronous runner Gate 2 failure does not execute Gate 3 and does not refresh `generationPlan.buildUnitPlan`
  - synchronous runner Gate 3 failure is covered with a malformed but non-empty `generationPlan.buildUnitPlan` reference, including dangling build/unit coverage references, so completeness checks cannot regress to "field exists means passed"
  - synchronous runner missing/cross-tenant app returns `GeneratedAppNotFoundException` before inserting ledgers
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
