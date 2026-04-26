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
  - `generation_plan jsonb null`
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
  - canonical gate snapshot: `gate_id`, `gate_order`, `gate_name`, `blocking`
  - `attempt_number integer not null default 1`
  - `status generated_app_gate_run_status not null`
  - `summary text not null`
  - `evidence jsonb not null default '[]'::jsonb`
  - nullable repair fields: `failure`, `repair_instructions`
  - lifecycle/audit columns: `started_at`, `completed_at`, `created_by`, `created_at`, `updated_at`
  - direct tenant RLS via `tenant_id`; creator endpoints must use tenant-aware DB access.
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
- Authenticated API:
  - `POST /generated-apps`
  - `GET /generated-apps`
  - `GET /generated-apps/:appId`
  - `PATCH /generated-apps/:appId/gates`
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
  - `attemptNumber`: integer 1-100, default 1.
  - `status`: `running | passed | failed | warning | skipped`.
  - `summary`: required human-readable result summary.
  - `evidence`: optional array of gate evidence objects; defaults to `[]`.
  - `failure`: optional `{ code?, message, details? }` object for failed or degraded runs.
  - `repairInstructions`: optional human-readable next repair instruction.
  - `startedAt` / `completedAt`: optional ISO timestamps; non-running runs default `completedAt` to server time when omitted.
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
  - The same request must update `generated_apps.gate_results`, replacing the current summary for that canonical gate while preserving other gates through canonical normalization.
  - The request must recompute `generated_apps.readiness` and `generated_apps.status` from the full normalized gate result set.
  - If the new readiness cannot create a public share, the request must set `public_share_enabled=false`, clear `public_share_token`, and set `public_share_disabled_at`.
  - The response returns `{ gateRun, app }`, where `gateRun` is the persisted run attempt and `app` is the updated creator-side generated app response.
- Gate run listing:
  - `GET /generated-apps/:appId/gate-runs` returns the standard paginated `{ data, meta }` envelope ordered by `created_at desc`.
  - Filters must include `tenant_id + generated_app_id`; optional `gateId` and `status` filters narrow the list.
  - Creator response may include tenant and creator audit fields because the endpoint is authenticated and tenant-scoped.
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

| Condition | Required behavior |
|-----------|-------------------|
| Empty or oversize prompt | Reject DTO validation before service logic |
| `appId` is not UUID | Controller rejects with `ParseUUIDPipe` |
| App not found in tenant scope | Return `GeneratedAppNotFoundException` |
| Blocking gates are pending/running/skipped | Readiness is `preview`; public share enable/regenerate returns 409 |
| Blocking gate failed | Readiness is `blocked`; public share enable/regenerate returns 409 |
| Non-blocking warning remains | Readiness is `trial`; public share enable/regenerate returns 409 |
| All blocking gates pass and no warning remains | Readiness is `publish_candidate`; public share can be enabled |
| Gate update downgrades readiness below publish candidate | Disable public link and clear old token |
| Gate run uses a non-canonical gate id | Reject DTO validation or domain validation before insert |
| Gate run is recorded for a missing app | Return `GeneratedAppNotFoundException` and do not insert evidence |
| Gate run records `failed` for a blocking gate | Insert run evidence, update current gate result to `failed`, recompute readiness to `blocked`, and clear public share token |
| Gate run records `running`, `skipped`, or `warning` for a blocking gate | Insert run evidence, recompute readiness to non-publishable state, and clear public share token |
| Gate run records `passed` but other blocking gates are still not passed | Keep readiness in `preview` and keep public share disabled |
| Creator disables public share | Disable link and clear old token; old URL must immediately stop working |
| Creator regenerates public share | Replace token; old URL must immediately stop working |
| Public token is missing, disabled, or not `published` | Public endpoint returns not found |
| Public app readiness no longer allows publish candidate | Public endpoint rejects rather than serving stale runtime |
| Public submission token is stale, disabled, or not `published` | Public submit/detail returns not found before touching submissions |
| Public submission app readiness is no longer publish candidate | Public submit/detail returns 409 and does not insert/read submission data |
| Public submit omits `anonymousSessionId` | Generate an opaque server-side anonymous session id and persist it |
| Public submit omits `input` | Persist `{}` |
| Public submit includes `clientContext` | Ignore it or store it only in non-privileged metadata; never use it for tenant/app/user authorization |
| Public submission detail uses a different current token | Return not found because `public_share_token` snapshot must match |
| Public submission row has `deleted_at` | Return not found |
| Creator list/detail sees rows from another tenant, another app, or soft-deleted rows | Exclude them by SQL filters |
| Creator single delete misses the row in tenant/app scope | Return `GeneratedAppSubmissionNotFoundException` |
| Creator batch delete includes unknown, duplicate, cross-tenant, cross-app, or already-deleted IDs | Ignore non-matching rows and return the actual `deletedCount` |

### 5. Good / Base / Bad Cases

- Good: gate runner writes all blocking gates as `passed`, verifier has no warning, service returns `publish_candidate`, and `POST /generated-apps/:appId/public-share` creates a 64-hex-character token.
- Base: newly created prompt generates an AppSpec draft and Gate 0 evidence, but Gate 1-7 remain pending; the app is visible to the creator but cannot create a public link.
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
  - gate run listing filters by tenant id, app id, gate id, and status and returns paginated results
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
  app.status !== 'published' ||
  app.readiness.state !== 'publish_candidate' ||
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
