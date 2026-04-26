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
  - `getGeneratedAppPublicRuntime(token)`
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
app.readiness.state === 'publish_candidate' &&
  app.readiness.canCreatePublicShare === true
```

- Disabled states:
  - `preview`, `trial`, `blocked`, and inconsistent `publish_candidate + canCreatePublicShare=false` must all disable public share actions.
  - The disabled UI must show backend `readiness.summary` so the creator sees the same reason the API enforces.
- Public share UI:
  - Creator workbench may show `publicShareUrl`, gate summaries, preview/source/test artifact links, and readiness details.
  - If `publicShareEnabled === true` but readiness is no longer eligible, treat the link as stale and unsafe: hide the old URL, hide regenerate/open actions, show `readiness.summary`, and only present disabled share controls.
  - Public runtime pages must not show `gateResults`, `readiness`, source artifact URLs, test report URLs, plugin permission details, public share tokens, or creator-only pages.
  - `getGeneratedAppPublicRuntime(token)` must map the response through a public whitelist before returning data to components. Allowed fields are `token`, `appId`, `title`, `description`, `dataUseNotice`, limited `appSpec` (`version`, `appName`, `summary`, `userGoal`, `actors`, `pages[].id/name/purpose`), `runtimeSurface.kind`, `runtimeSurface.previewUrl`, and `createdAt`.
  - Even though the API client may keep `token` for cache identity/debugging, public runtime components must not render token values or a derived access identifier.
- Creator submissions UI:
  - `/generated-apps/$appId` contains a creator-only submissions section backed by `GET /generated-apps/:appId/submissions`.
  - The submissions list supports pagination and optional `status` filter using the backend submission status union: `received | running | completed | failed`.
  - Each row surfaces status, anonymous session id, creation time, and compact summaries for `input`, `result`, `report`, and `errorMessage`.
  - Selecting a row reads `GET /generated-apps/:appId/submissions/:submissionId` and shows read-only JSON panels for `input`, `result`, and `report`, plus an error text panel.
  - Delete actions must require explicit confirmation, call the creator delete APIs, show toast feedback, and invalidate submission list/detail query keys.
  - Batch delete may be exposed through selection checkboxes and must call `POST /generated-apps/:appId/submissions/delete` with `{ ids }`.
  - Creator responses may contain `publicShareToken` for audit, but the Studio submissions UI must not render token values in list or detail by default.
- Creator generation evidence UI:
  - `/generated-apps/$appId` contains a creator-only generation evidence section backed by generation run, repair attempt, and gate run list APIs.
  - Generation runs are listed with run number, status, trigger source, repair/runtime budget, summary, failure reason, started time, and completed time.
  - Until a generation run is selected, repair attempt and Gate run queries stay disabled and the panel shows a selection prompt instead of app-wide evidence.
  - Selecting a generation run scopes repair attempts to that run and scopes gate runs by `generationRunId`.
  - Selecting a repair attempt further scopes gate runs by `repairAttemptId`; clearing the repair selection falls back to the selected run scope.
  - Repair attempts surface target gate id, attempt number, status, failure summary, change summary, and verification summary.
  - Gate runs surface canonical gate snapshot, status, attempt number, blocking flag, summary, failure/repair text, evidence count, and compact evidence summaries.
  - The evidence section must not render public share token values, creator submission `publicShareToken`, or evidence URLs by default; use evidence labels/kinds/summaries for the first creator-side view.
- Public submissions API boundary:
  - Public submission functions may exist in the generated-app API layer for future custom generated frontends.
  - The built-in `GeneratedAppPublicRuntimePage` must not grow a fixed form/template submission UI. End-user submission UX belongs to generated/custom runtime surfaces, not a hardcoded Studio public page.
  - Public submission responses must stay separate from creator submission responses and must not expose tenant id, public token, readiness, gate evidence, source/test artifacts, or plugin/internal fields.
- Public route shell:
  - Static public routes (`/login`, `/register`, `/auth/callback`) must be exact matches.
  - Token-style public routes may use explicit prefixes only (`/s/`, `/generated-apps/public/`).
  - Public Generated App runtime must render without authenticated Studio shell/sidebar and must pass `authToken: undefined` to notification socket wiring even when a browser has an existing auth token.
- Navigation:
  - `/generated-apps` is a top-level Studio workbench entry.
  - It should sit near Agent/Workflow creation surfaces, not under Settings.

### 4. Validation & Error Matrix

| Condition | Required UI behavior |
|-----------|----------------------|
| Prompt is empty | Disable or reject create submission locally |
| Create succeeds | Clear the prompt, refresh generated app lists, and surface the new task in the workbench |
| List fetch fails | Show a workbench error state; do not fabricate tasks |
| `readiness.state='preview'` | Disable public share, show `readiness.summary` |
| `readiness.state='blocked'` | Disable public share, show `readiness.summary` |
| `readiness.state='trial'` | Disable public share, show `readiness.summary`; do not label it publishable |
| `readiness.state='publish_candidate'` but `canCreatePublicShare=false` | Disable public share; treat it as backend-inconsistent and unsafe |
| `readiness.state='publish_candidate'` and `canCreatePublicShare=true` | Allow enable/regenerate share mutations |
| `publicShareEnabled=true` but readiness is not eligible | Treat as stale; do not show old URL or regenerate/open actions |
| Share mutation succeeds | Update detail cache and invalidate list queries |
| Creator submission list fetch fails | Show an error state and retry action; do not fabricate submissions |
| Creator submission list is empty | Show an empty state, not a blank table |
| Creator selects a submission | Fetch detail by `appId + submissionId` and render read-only `input/result/report/errorMessage` |
| Creator deletes one submission | Confirm first, call single delete, clear selected detail if needed, invalidate submissions list/detail, and toast success/failure |
| Creator deletes selected submissions | Confirm first, call bulk delete with `{ ids }`, clear selection/detail if needed, invalidate submissions list/detail, and toast success/failure |
| Generation run list is empty | Show an empty state, not a blank table |
| No generation run is selected | Do not fetch repair attempt or Gate run evidence lists; show a selection prompt |
| Creator selects a generation run | Fetch repair attempts by `appId + generationRunId` and gate runs with `generationRunId` |
| Creator selects a repair attempt | Fetch gate runs with both `generationRunId` and `repairAttemptId` |
| Generation evidence list fetch fails | Show an error state and retry action; do not fabricate run or gate data |
| `/generated-apps/public/:token` lookup fails | Show an inaccessible/closed public state; do not redirect to login |
| `/login-required-private` or another same-prefix private route is visited unauthenticated | Treat as private and redirect to login |

### 5. Good / Base / Bad Cases

- Good: a newly created app appears in the list as preview-only, with Gate readiness summary visible and public share disabled.
- Good: a publish candidate row enables the public-share action and mutation invalidates list queries.
- Good: a public runtime page shows data-use notice, public AppSpec summary, and a runtime preview link without rendering Studio navigation or the token value.
- Good: creator detail page shows submission rows and detail JSON panels without rendering `publicShareToken`.
- Good: creator detail page shows generation runs, repair attempts, and Gate run evidence summaries, while filtering Gate runs by the selected generation run and optional repair attempt.
- Good: creator deletion uses single or batch delete API after confirmation and refreshes submission caches.
- Base: a generated app has warning-only readiness; Studio displays trial/warning summary and keeps public share unavailable.
- Base: a generated app has no public submissions; Studio shows an empty state and keeps the rest of the workbench usable.
- Bad: Studio enables share because `status === 'publish_candidate'` while `readiness.canCreatePublicShare` is false.
- Bad: Studio shows an old `publicShareUrl` because `publicShareEnabled=true` even though readiness has fallen back to `blocked`, `trial`, or unsafe `publish_candidate`.
- Bad: Studio hides backend readiness summary and replaces it with a generic "not ready" message only.
- Bad: Studio exposes internal test/source/plugin permission details on an end-user public runtime page.
- Bad: Studio treats `/login-required-private` as public because `/login` was checked with `startsWith`.
- Bad: Studio renders public share token values as a default column in the submissions table.
- Bad: Studio renders evidence URLs or public token snapshots as default columns in the generation evidence panel.
- Bad: the built-in public runtime page grows a fixed generated-app form that bypasses the custom generated frontend/runtime surface.

### 6. Tests Required

- API tests:
  - paths for create/list/detail/gate update/share enable/share regenerate/share disable.
  - paths for creator submission list/detail/single delete/bulk delete.
  - paths for generation run list, repair attempt list, and gate run list filters.
  - public submission create/detail helper paths if those helpers exist.
  - Generated App payload casing remains camelCase unless backend changes.
- Query/mutation tests:
  - share enable writes the detail cache and invalidates list queries.
  - create invalidates list queries.
  - creator submission delete mutations invalidate submission list/detail keys and clear removed detail caches.
- Component tests:
  - `preview`, `trial`, and `blocked` disable public share and show `readiness.summary`.
  - `publish_candidate + canCreatePublicShare=false` disables public share.
  - `publish_candidate + canCreatePublicShare=true` triggers the share mutation.
  - stale enabled share (`publicShareEnabled=true` + ineligible readiness) hides old public URL and regenerate/open actions.
  - public runtime API mapping drops creator-only fields and nested source/test/plugin artifacts.
  - public runtime page renders data-use notice, limited AppSpec, optional preview link, and does not render tokens or internal fields.
  - creator submissions panel renders list rows, detail selection, status filter, pagination, delete confirmation, empty state, and error state.
  - creator generation evidence panel renders generation runs, loads repair/gate data after run selection, filters gate data after repair selection, shows failure/evidence summaries, and shows empty/error states.
  - detail page tests either mock the submissions hooks or assert the submissions section renders with an empty state.
- Route/navigation smoke:
  - `/generated-apps` route is registered in the route tree.
  - `/generated-apps/public/$token` route is registered and bypasses auth shell without opening authenticated notification socket.
  - public static routes use exact matching so same-prefix private routes still redirect to login.
  - App sidebar contains a Generated App workbench entry.

### 7. Wrong vs Correct

Wrong:

```tsx
const canShare = app.status === 'publish_candidate';
```

Correct:

```tsx
const canShare =
  app.readiness.state === 'publish_candidate' &&
  app.readiness.canCreatePublicShare;
```

Wrong:

```tsx
const isPublicRoute = PUBLIC_ROUTES.some((route) =>
  pathname.startsWith(route),
);
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
