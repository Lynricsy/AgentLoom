# Generated App Studio Contracts

## Scenario: Generated App Creator Workbench

### 1. Scope / Trigger

- Trigger: implementing or modifying `src/features/generated-app/**`, `/generated-apps` routes, Generated App navigation entries, or any Studio UI that creates/enables/regenerates/disables Generated App public links.
- Studio must treat the backend `readiness` object as authoritative. The frontend may explain readiness, but must not invent a separate publish eligibility rule.
- The first surface is a creator workbench, not a marketing page and not a workflow canvas replacement.

### 2. Signatures

- Routes:
  - `/generated-apps`: creator list and one-prompt creation page.
  - `/generated-apps/$appId`: creator detail/workbench route for AppSpec, scenarios, gates, artifacts, resource bindings, and public-share management.
  - `/generated-apps/public/$token`: unauthenticated end-user runtime entry for a Generated App public link.
- API functions:
  - `createGeneratedApp({ prompt })`
  - `listGeneratedApps({ page?, pageSize?, status? })`
  - `getGeneratedApp(appId)`
  - `getGeneratedAppArtifactManifest(appId)`
  - `getGeneratedAppArtifactContent(appId, artifactId)`
  - `getGeneratedAppPublicRuntime(token)`
  - `startGeneratedAppGenerationRun(appId, { triggerSource?, maxRepairAttempts?, maxRuntimeSeconds? })`
  - `listGeneratedAppSubmissions(appId, { page?, pageSize?, status? })`
  - `getGeneratedAppSubmission(appId, submissionId)`
  - `deleteGeneratedAppSubmission(appId, submissionId)`
  - `deleteGeneratedAppSubmissions(appId, ids)`
  - `createGeneratedAppPublicSubmission(token, payload)`
  - `getGeneratedAppPublicSubmission(token, submissionId)`
  - `recordGeneratedAppGateResults(appId, payload)`
  - `listGeneratedAppGenerationRuns(appId, { page?, pageSize?, status? })`
  - `listGeneratedAppRepairAttempts(appId, generationRunId, { page?, pageSize?, status?, targetGateId? })`
  - `listGeneratedAppGateRuns(appId, { page?, pageSize?, gateId?, status?, generationRunId?, repairAttemptId? })`
  - `enableGeneratedAppPublicShare(appId)`
  - `regenerateGeneratedAppPublicShare(appId)`
  - `disableGeneratedAppPublicShare(appId)`
- Query keys:
  - `generatedAppKeys.all`
  - `generatedAppKeys.lists()`
  - `generatedAppKeys.list(params)`
  - `generatedAppKeys.detail(appId)`
  - `generatedAppKeys.artifactManifest(appId)`
  - `generatedAppKeys.artifactContent(appId, artifactId)`
  - `generatedAppKeys.generationRunLists(appId)`
  - `generatedAppKeys.generationRunList(appId, params)`
  - `generatedAppKeys.repairAttemptLists(appId, generationRunId)`
  - `generatedAppKeys.repairAttemptList(appId, generationRunId, params)`
  - `generatedAppKeys.gateRunLists(appId)`
  - `generatedAppKeys.gateRunList(appId, params)`
  - `generatedAppKeys.submissionLists(appId)`
  - `generatedAppKeys.submissionList(appId, params)`
  - `generatedAppKeys.submissionDetails(appId)`
  - `generatedAppKeys.submissionDetail(appId, submissionId)`
  - `generatedAppKeys.publicRuntime(token)`
  - `generatedAppKeys.publicSubmission(token, submissionId)`

### 3. Contracts

- Request/response casing:
  - Generated App backend DTOs intentionally use camelCase fields for nested JSON payloads such as `pageSize`, `gateResults`, `generationPlan`, `sourceArtifactUrl`, and `testReportUrl`.
  - Do not snake-case Generated App request payloads by default unless the backend DTO changes.
- Publish eligibility:
  - Enable public share only when:

```ts
app.readiness.state === "publish_candidate" &&
  app.readiness.canCreatePublicShare === true;
```

- Disabled states:
  - `preview`, `trial`, `blocked`, and inconsistent `publish_candidate + canCreatePublicShare=false` must all disable public share actions.
  - The disabled UI must show backend `readiness.summary` so the creator sees the same reason the API enforces.
- Public share UI:
  - Creator workbench may show `publicShareUrl`, gate summaries, preview/source/test artifact links, and readiness details.
  - If `publicShareEnabled === true` but readiness is no longer eligible, treat the link as stale and unsafe: hide the old URL, hide regenerate/open actions, show `readiness.summary`, and only present disabled share controls.
  - Public runtime pages must not show `gateResults`, `readiness`, source artifact URLs, test report URLs, plugin permission details, public share tokens, or creator-only pages.
  - `getGeneratedAppPublicRuntime(token)` must map the response through a public whitelist before returning data to components. Allowed fields are `token`, `appId`, `title`, `description`, `dataUseNotice`, limited `appSpec` (`version`, `appName`, `summary`, `userGoal`, `actors`, `pages[].id/name/purpose`), `runtimeSurface.kind`, `runtimeSurface.previewUrl`, `runtimeForm`, and `createdAt`.
  - When `runtimeSurface.previewUrl` is the backend public build preview path (`/api/v1/generated-apps/public/:token/preview`), the API mapping may resolve it against an absolute `VITE_API_BASE_URL`; same-origin `/api/v1` deployments should keep the relative path unchanged.
  - Public runtime pages may render only an "open preview" link for `runtimeSurface.previewUrl`; they must not inline the preview HTML, call creator artifact APIs, list artifacts, or expose source/test/report workspace metadata. The opened preview HTML is allowed to submit to same-origin public submission APIs from its own route, but the Studio public runtime page still keeps submission handling in the built-in `runtimeForm` surface.
  - `runtimeForm` mapping must keep only safe dynamic business-form fields: `formId`, `title`, `description`, `submitLabel`, `sections[].id/title/description/fieldIds`, `fields[].id/label/type/required/placeholder/helpText/options/min/max/step`, `fields[].options[].value/label`, and `resultView.title/description/emptyState/successTitle/nextStepHint`.
  - Even though the API client may keep `token` for cache identity/debugging, public runtime components must not render token values or a derived access identifier.
- Creator generation action:
  - `/generated-apps` may create a Generated App and immediately call `startGeneratedAppGenerationRun()` with `triggerSource='initial'` so zero-background users do not need to understand Gate APIs.
  - `/generated-apps/$appId` exposes a creator primary action for running or rerunning automatic generation and verification.
  - The start-run mutation must write the returned `app` into the detail cache and invalidate generated app lists, runtime binding readiness, generation-run lists, Gate-run lists, and the selected run's repair-attempt list when a run id is returned.
  - Starting a generation run must not enable public sharing by itself. Public-share enable/regenerate controls still rely only on backend `readiness.state === 'publish_candidate' && readiness.canCreatePublicShare === true`.
- Creator artifact delivery:
  - `/generated-apps/$appId` contains a creator-only Artifacts panel backed by `GET /generated-apps/:appId/artifacts` and `GET /generated-apps/:appId/artifacts/:artifactId`.
  - The panel may show legacy preview/source/test URLs from `app.preview`, but controlled workspace source and test files must come from the artifact manifest/content APIs instead of guessing paths client-side.
  - Workspace summary may render `rootLabel`, `relativePath`, `scaffold`, and Gate 3 `executionLevel`; it must not render a host absolute workspace path.
  - Artifact rows show `label`, workspace-relative `path`, kind label, materialized/readable status, and size. Unreadable or unmaterialized artifacts stay disabled and must not trigger content queries.
  - When the manifest contains readable artifact `gate-3-build-output-html`, the Artifacts panel must also render it as the creator-side Gate 3 build preview in a sandboxed iframe using `srcDoc` and `sandbox=""`. Missing or unreadable build output shows a local empty/unavailable state instead of guessing paths or falling back to legacy preview URLs.
  - Selecting a readable artifact calls `useGeneratedAppArtifactContent(appId, artifactId)` and displays inline text content with loading/error/empty states.
  - `useGeneratedAppArtifactManifest(appId)` is disabled when `appId` is empty. `useGeneratedAppArtifactContent(appId, artifactId)` is disabled until both ids are present.
  - Start-run and app-changing mutations must invalidate `generatedAppKeys.artifactManifest(appId)` so newly materialized Gate 3 artifacts appear without a full reload.
  - The public runtime route and public runtime API mapping must not call artifact manifest/content APIs and must not render source/test artifact rows or controlled workspace metadata.
- Creator resource bindings:
  - `/generated-apps/$appId` displays creator-side professional resource bindings for Agent, Workflow, and plugins.
  - Bound Agent resources link to the existing `/agents/$agentId` professional editor route; bound Workflow resources link to the existing `/workflows/$workflowId` professional editor route. Do not introduce Generated App-specific editor routes for these links.
  - Missing Agent or Workflow bindings must show a clear empty state such as `尚未绑定`, and must not render a link with an empty path parameter.
  - The resource binding section must explain that these links are creator-side internal resources and are not shown in the public runtime.
  - `/generated-apps/$appId` also shows a compact creator-only runtime binding readiness panel backed by `GET /generated-apps/:appId/runtime-binding-readiness` and `useGeneratedAppRuntimeBindingReadiness(appId)`.
  - Runtime binding readiness states map to explicit creator copy: `deterministic_only` means public submissions return only the local deterministic report; `editor_handoff_draft` means a legacy or manually bound professional editor draft is present but public submissions will not execute it and the creator must bind/publish a real Workflow; `workflow_not_found` means the bound Workflow is missing or inaccessible; `workflow_not_published` means the bound Workflow is not published; `workflow_published` means public submissions can create async Workflow executions. After a successful Gate 7 real-local generation run, the default Generated App runtime Workflow should normally appear as `workflow_published`.
  - The runtime binding readiness panel must not render `publicShareToken`, Workflow metadata, editor URLs, or internal ids. The existing authenticated Resource bindings section may continue to show the bound Workflow id and professional editor link because that is the creator-side debug/editor surface.
  - Runtime binding readiness is informational for creator runtime binding health. It must not change the public-share readiness gate, must not auto-enable public sharing, and must not auto-publish legacy editor handoff drafts. Gate 7's generated runtime Workflow may already be published by the backend, but public sharing still requires the explicit public-share action.
  - The public runtime route and public runtime API mapping must not render `agentDefinitionId`, `workflowDefinitionId`, plugin ids, professional editor links, public share token values, source artifacts, test reports, readiness, or Gate evidence.
- Creator submissions UI:
  - `/generated-apps/$appId` contains a creator-only submissions section backed by `GET /generated-apps/:appId/submissions`.
  - The submissions list supports pagination and optional `status` filter using the backend submission status union: `received | running | completed | failed`.
  - Each row surfaces status, anonymous session id, creation time, and compact summaries for `input`, `result`, `report`, and `errorMessage`.
  - Selecting a row reads `GET /generated-apps/:appId/submissions/:submissionId` and shows read-only JSON panels for `input`, `result`, and `report`, plus an error text panel.
  - Selected submission detail also shows a compact creator-only Workflow execution status block above the JSON panels. The block reads handoff data from `report` first and falls back to `result`, renders no-handoff, unavailable/not-started, pending, running, paused, completed, failed, and cancelled states as human-readable copy, and may show only safe notice, updated/completed timestamps, and step-count summary fields.
  - The Workflow execution status block must not render `executionId`, `workflowDefinitionId`, `publicShareToken`, source/test artifact fields, Gate evidence, or internal JSON. The existing creator JSON panels remain the explicit debug surface for raw `input/result/report` payloads.
  - Creator and public submission detail queries must treat detail data as immediately stale and poll every 2 seconds while `result` or `report` contains a Workflow execution handoff with `executionStatus='pending' | 'running' | 'paused'`; polling stops for `completed`, `failed`, `cancelled`, unavailable handoff, or missing handoff states.
  - Public and creator Workflow execution status panels must treat `paused` as a non-terminal active handoff that continues polling. The UI may explain that the execution is paused, but it must keep the running/refresh affordance and must not present `paused` as a warning terminal state.
  - Creator submission detail must keep already-loaded detail content visible during background handoff polling. Use a compact inline refresh indicator while `isFetching=true`; do not replace the whole detail panel with the initial loading state unless there is no selected submission data yet.
  - Delete actions must require explicit confirmation, call the creator delete APIs, show toast feedback, and invalidate submission list/detail query keys.
  - Batch delete may be exposed through selection checkboxes and must call `POST /generated-apps/:appId/submissions/delete` with `{ ids }`.
  - Creator responses may contain `publicShareToken` for audit, but the Studio submissions UI must not render token values in list or detail by default.
- Creator generation evidence UI:
  - `/generated-apps/$appId` contains a creator-only generation evidence section backed by generation run, repair attempt, and gate run list APIs.
  - Generation runs are listed with run number, status, trigger source, repair/runtime budget, summary, failure reason, started time, and completed time.
  - The detail page enables evidence-panel auto-selection: after the generation run list finishes loading, the first visible generation run is selected automatically so creators immediately see the latest scoped repair attempts and Gate evidence.
  - The reusable evidence panel keeps manual selection as its default. Until a generation run is selected in manual mode, repair attempt and Gate run queries stay disabled and the panel shows a selection prompt instead of app-wide evidence.
  - Selecting a generation run scopes repair attempts to that run and scopes gate runs by `generationRunId`.
  - Selecting a repair attempt further scopes gate runs by `repairAttemptId`; clearing the repair selection falls back to the selected run scope.
  - Repair attempts surface target gate id, attempt number, status, failure summary, change summary, and verification summary.
  - When a repair attempt includes structured `repairPlan` or `reverificationPlan`, the evidence panel must show a compact creator-facing summary of patch targets and required re-verification Gate/command ids. This summary is diagnostic context only and must not imply that the patch has already been applied.
  - A failed repair attempt whose summaries state that the synchronous runner did not apply a source/Workflow/plugin patch must show a compact creator-facing notice that the failed gate has been identified but no patch was applied. This notice must not imply the app was repaired, and it should point the creator to rerun only after the underlying gap is fixed.
  - Gate runs surface canonical gate snapshot, status, attempt number, blocking flag, summary, failure/repair text, evidence count, and compact evidence summaries.
  - The evidence section must not render public share token values, creator submission `publicShareToken`, or evidence URLs by default; use evidence labels/kinds/summaries for the first creator-side view.
- Public submissions API boundary:
  - Public submission functions exist in the generated-app API layer for both built-in public runtime and future custom generated frontends.
  - The built-in `GeneratedAppPublicRuntimePage` renders the whitelisted `runtimeForm` as the end-user business input surface, including required validation and `text | textarea | single_select | multi_select | number | range` field controls.
  - The built-in page posts through `createGeneratedAppPublicSubmission(token, payload)`, reads the resulting detail through `getGeneratedAppPublicSubmission(token, submissionId)`, and displays terminal-user-readable status, structured report sections, next-step questions, follow-up prompts, boundary notices, and error message.
  - Public runtime results must not default to an internal JSON dump. JSON-like values may be parsed only into whitelisted report sections; internal keys such as `runtimeKind`, tokens, readiness, gate evidence, source/test artifacts, plugin ids, and creator-only fields must not render in the public page.
  - Public submission responses must stay separate from creator submission responses and must not expose tenant id, public token, readiness, gate evidence, source/test artifacts, or plugin/internal fields.
- Public route shell:
  - Static public routes (`/login`, `/register`, `/auth/callback`) must be exact matches.
  - Token-style public routes may use explicit prefixes only (`/s/`, `/generated-apps/public/`).
  - Public Generated App runtime must render without authenticated Studio shell/sidebar and must pass `authToken: undefined` to notification socket wiring even when a browser has an existing auth token.
- Navigation:
  - `/generated-apps` is a top-level Studio workbench entry.
  - It should sit near Agent/Workflow creation surfaces, not under Settings.

### 4. Validation & Error Matrix

| Condition                                                                                 | Required UI behavior                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt is empty                                                                           | Disable or reject create submission locally                                                                                                                     |
| Create succeeds                                                                           | Clear the prompt, refresh generated app lists, start the initial automatic generation run or surface a retryable start failure, and show a detail link          |
| List fetch fails                                                                          | Show a workbench error state; do not fabricate tasks                                                                                                            |
| Start generation run succeeds                                                             | Update detail cache, invalidate list/generation-run/Gate-run caches, show a creator-facing completion/failure summary, and keep public share gated by readiness |
| Start generation run fails after create                                                   | Keep the created app, show the failure reason, and offer the detail page so the creator can rerun                                                               |
| `readiness.state='preview'`                                                               | Disable public share, show `readiness.summary`                                                                                                                  |
| `readiness.state='blocked'`                                                               | Disable public share, show `readiness.summary`                                                                                                                  |
| `readiness.state='trial'`                                                                 | Disable public share, show `readiness.summary`; do not label it publishable                                                                                     |
| `readiness.state='publish_candidate'` but `canCreatePublicShare=false`                    | Disable public share; treat it as backend-inconsistent and unsafe                                                                                               |
| `readiness.state='publish_candidate'` and `canCreatePublicShare=true`                     | Allow enable/regenerate share mutations                                                                                                                         |
| `publicShareEnabled=true` but readiness is not eligible                                   | Treat as stale; do not show old URL or regenerate/open actions                                                                                                  |
| Share mutation succeeds                                                                   | Update detail cache and invalidate list queries                                                                                                                 |
| Creator submission list fetch fails                                                       | Show an error state and retry action; do not fabricate submissions                                                                                              |
| Creator submission list is empty                                                          | Show an empty state, not a blank table                                                                                                                          |
| Creator selects a submission                                                              | Fetch detail by `appId + submissionId` and render read-only `input/result/report/errorMessage`                                                                  |
| Creator-selected submission detail is background-refetching due to Workflow handoff polling | Keep the current detail visible, show a compact refresh indicator, and continue rendering the Workflow status block                                              |
| Creator deletes one submission                                                            | Confirm first, call single delete, clear selected detail if needed, invalidate submissions list/detail, and toast success/failure                               |
| Creator deletes selected submissions                                                      | Confirm first, call bulk delete with `{ ids }`, clear selection/detail if needed, invalidate submissions list/detail, and toast success/failure                 |
| Generation run list is empty                                                              | Show an empty state, not a blank table                                                                                                                          |
| No generation run is selected in the reusable panel's manual mode                          | Do not fetch repair attempt or Gate run evidence lists; show a selection prompt                                                                                 |
| Creator opens `/generated-apps/$appId` with visible generation runs                        | Auto-select the first visible generation run after list loading completes, then fetch scoped repair attempts and Gate runs                                       |
| Creator selects a generation run                                                          | Fetch repair attempts by `appId + generationRunId` and gate runs with `generationRunId`                                                                         |
| Creator selects a repair attempt                                                          | Fetch gate runs with both `generationRunId` and `repairAttemptId`                                                                                               |
| Repair attempt includes `repairPlan` / `reverificationPlan`                                | Show patch targets and required re-verification Gate/command ids as creator-only diagnostic context; do not present it as proof that a repair was applied       |
| Generation evidence list fetch fails                                                      | Show an error state and retry action; do not fabricate run or gate data                                                                                         |
| Creator artifact manifest fetch fails                                                     | Show an error state with retry; do not fabricate workspace files                                                                                                 |
| Creator artifact manifest has `workspace=null` or no artifacts                             | Show an empty state that Gate 3 has no controlled workspace artifacts yet                                                                                        |
| Creator selects an unreadable or unmaterialized artifact                                   | Keep the content query disabled and show an unavailable state                                                                                                    |
| Creator artifact content fetch fails                                                      | Show an error state with retry; do not fall back to raw paths or legacy preview URLs                                                                             |
| `/generated-apps/public/:token` lookup fails                                              | Show an inaccessible/closed public state; do not redirect to login                                                                                              |
| Public runtime required form fields are empty                                             | Reject locally, mark required fields, and keep the user on the public runtime page                                                                               |
| Public runtime submission succeeds                                                        | Show terminal-user-readable status, structured report sections, next-step questions, follow-up prompts, boundary notices, and error message from public submission response/detail |
| Public runtime submission/detail response includes creator-only fields                    | Drop them in the API mapping or avoid rendering them in the component                                                                                           |
| `/login-required-private` or another same-prefix private route is visited unauthenticated | Treat as private and redirect to login                                                                                                                          |

### 5. Good / Base / Bad Cases

- Good: a newly created app starts its initial automatic generation run from the list page, surfaces the resulting summary, and keeps public share disabled unless backend readiness says it is publishable.
- Good: the creator detail page can rerun automatic generation and verification, then refresh generation-run/Gate-run evidence while leaving public-share controls readiness-gated.
- Good: a publish candidate row enables the public-share action and mutation invalidates list queries.
- Good: a public runtime page shows data-use notice, public AppSpec summary, a dynamic business form from `runtimeForm`, optional runtime preview link, and structured public submission report/status without rendering Studio navigation, internal JSON dumps, or the token value.
- Good: opening the optional public build preview link loads only the backend-served Gate 3 HTML; that HTML can submit and poll via same-origin public submission APIs, but it cannot call creator artifact APIs or reveal workspace metadata.
- Good: creator detail page shows submission rows and detail JSON panels without rendering `publicShareToken`.
- Good: creator detail page shows generation runs, repair attempts, and Gate run evidence summaries, while filtering Gate runs by the selected generation run and optional repair attempt.
- Good: creator detail page auto-selects the first visible generation run so the latest repair attempts and Gate evidence are visible without requiring a novice creator to understand run selection first.
- Good: creator detail page highlights an automatic failed repair attempt as "failure gate identified, no patch applied" when the backend summary says the synchronous runner did not apply a patch.
- Good: creator detail page shows structured repair work order and re-verification plan summaries beside repair attempts without exposing public share tokens or evidence URLs.
- Good: creator detail page shows controlled Gate 3 workspace artifact summaries, previews readable source/test/report content, and renders readable `dist/index.html` build output in a sandboxed iframe without rendering the host absolute workspace root.
- Good: creator deletion uses single or batch delete API after confirmation and refreshes submission caches.
- Good: creator detail page shows Agent and Workflow ids only inside the authenticated workbench, links them to `/agents/$agentId` and `/workflows/$workflowId`, and shows `尚未绑定` without links when ids are absent.
- Base: a generated app has warning-only readiness; Studio displays trial/warning summary and keeps public share unavailable.
- Base: a generated app has no public submissions; Studio shows an empty state and keeps the rest of the workbench usable.
- Bad: Studio enables share because `status === 'publish_candidate'` while `readiness.canCreatePublicShare` is false.
- Bad: Studio shows an old `publicShareUrl` because `publicShareEnabled=true` even though readiness has fallen back to `blocked`, `trial`, or unsafe `publish_candidate`.
- Bad: Studio hides backend readiness summary and replaces it with a generic "not ready" message only.
- Bad: Studio exposes internal test/source/plugin permission details on an end-user public runtime page.
- Bad: Studio treats `/login-required-private` as public because `/login` was checked with `startsWith`.
- Bad: Studio renders public share token values as a default column in the submissions table.
- Bad: Studio renders evidence URLs or public token snapshots as default columns in the generation evidence panel.
- Bad: Studio reads artifact content by passing a raw path or renders controlled workspace source/test artifacts on `/generated-apps/public/$token`.
- Bad: the built-in public runtime page posts submissions through creator endpoints or renders creator-only submission fields such as tenant id, public token, readiness, gate results, source/test artifacts, or plugin ids.
- Bad: Studio invents `/generated-apps/:appId/workflow-editor` or another Generated App-specific professional editor route instead of linking to the existing Agent/Workflow editor routes.
- Bad: Studio renders public runtime resource ids or editor links because `agentDefinitionId` or `workflowDefinitionId` exists on the creator DTO.

### 6. Tests Required

- API tests:
  - paths for create/list/detail/gate update/share enable/share regenerate/share disable.
  - path and camelCase payload for `POST /generated-apps/:appId/generation-runs/start`.
  - paths for creator submission list/detail/single delete/bulk delete.
  - paths for generation run list, repair attempt list, and gate run list filters.
  - paths for artifact manifest and encoded artifact content ids.
  - public runtime mapping preserves whitelisted `runtimeForm` fields and drops nested creator-only/internal fields.
  - public submission create/detail helper paths and response whitelist behavior.
  - Generated App payload casing remains camelCase unless backend changes.
- Query/mutation tests:
  - share enable writes the detail cache and invalidates list queries.
  - create invalidates list queries.
  - start generation run writes the returned app into detail cache and invalidates list, runtime binding readiness, generation-run, Gate-run, and repair-attempt query keys.
  - artifact manifest and artifact content queries use their dedicated keys and remain disabled until required ids exist.
  - start-run and app-changing mutations invalidate artifact manifest keys.
  - public runtime API mapping preserves legacy absolute preview URLs and resolves backend `/api/v1/generated-apps/public/:token/preview` URLs correctly when `VITE_API_BASE_URL` is absolute.
  - public submission create writes and invalidates the public submission detail query key.
  - creator and public submission detail queries poll every 2 seconds only for Workflow handoff `pending | running | paused` and stop polling for terminal or unavailable handoff states.
  - runtime binding readiness query uses `generatedAppKeys.runtimeBindingReadiness(appId)` and is disabled when `appId` is empty.
  - creator submission delete mutations invalidate submission list/detail keys and clear removed detail caches.
- Component tests:
  - `preview`, `trial`, and `blocked` disable public share and show `readiness.summary`.
  - `publish_candidate + canCreatePublicShare=false` disables public share.
  - `publish_candidate + canCreatePublicShare=true` triggers the share mutation.
  - stale enabled share (`publicShareEnabled=true` + ineligible readiness) hides old public URL and regenerate/open actions.
  - public runtime API mapping drops creator-only fields and nested source/test/plugin artifacts.
  - public runtime page opens the optional preview link without rendering source/test artifact rows or controlled workspace metadata.
  - list page creation starts automatic generation and provides a detail link even when the runner fails after create.
  - detail page start-run action triggers automatic generation and verification without enabling public share.
  - detail page runtime binding readiness covers editor-handoff draft not auto-executing, published Workflow being executable, and no Workflow falling back to deterministic-only behavior.
  - public runtime page renders data-use notice, limited AppSpec, optional preview link, dynamic `runtimeForm` controls, required validation, submitted payload, structured result/report sections, and does not render tokens or internal fields.
  - public runtime page renders `pending`, `running`, and `paused` Workflow execution handoffs as active polling states, while terminal handoffs render safe completed/failed/cancelled copy without internal ids.
  - creator submissions panel renders list rows, detail selection, status filter, pagination, delete confirmation, empty state, and error state.
  - creator submissions panel keeps selected detail visible during background polling and renders `paused` as a non-terminal active Workflow handoff without exposing execution/workflow ids.
  - creator generation evidence panel renders generation runs, loads repair/gate data after run selection, filters gate data after repair selection, shows failure/evidence summaries, and shows empty/error states.
  - creator detail page enables generation evidence auto-selection, while the reusable panel default still leaves repair/gate queries disabled until manual selection.
  - creator generation evidence panel renders structured repair work order and re-verification plan summaries when repair attempts include them.
  - creator generation evidence panel highlights failed automatic repair attempts that did not apply a patch, and does not show that notice for completed manual repair attempts.
  - creator artifact delivery panel renders workspace summary, artifact rows, selected readable content, Gate 3 build-output sandbox iframe preview for readable `gate-3-build-output-html`, empty/error states, disabled unreadable artifacts, and does not render host absolute paths.
  - detail page tests either mock the submissions hooks or assert the submissions section renders with an empty state.
  - detail page renders existing Agent/Workflow editor links for bound ids and renders no editor links for missing ids.
- Route/navigation smoke:
  - `/generated-apps` route is registered in the route tree.
  - `/generated-apps/public/$token` route is registered and bypasses auth shell without opening authenticated notification socket.
  - public static routes use exact matching so same-prefix private routes still redirect to login.
  - App sidebar contains a Generated App workbench entry.

### 7. Wrong vs Correct

Wrong:

```tsx
const artifactUrl = `/api/v1/generated-apps/${appId}/artifacts?path=${path}`;
```

Correct:

```tsx
const manifestQuery = useGeneratedAppArtifactManifest(appId);
const contentQuery = useGeneratedAppArtifactContent(appId, selectedArtifactId);
```

Wrong:

```tsx
const canShare = app.status === "publish_candidate";
```

Correct:

```tsx
const canShare =
  app.readiness.state === "publish_candidate" &&
  app.readiness.canCreatePublicShare;
```

Wrong:

```tsx
const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
```

Correct:

```tsx
const isPublicRoute =
  PUBLIC_ROUTES.includes(pathname) ||
  PUBLIC_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
```

Wrong:

```tsx
<Button disabled={!canShare}>阻断门禁未全绿不能发布</Button>
```

Correct:

```tsx
<Button disabled={!canShare} title={publishBlockReason}>
  公开分享不可用
</Button>
<p>{app.readiness.summary}</p>
```
