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
- Status enum:
  - `app_spec_ready`
  - `preview_ready`
  - `trial_ready`
  - `publish_candidate`
  - `published`
  - `failed`
- Authenticated API:
  - `POST /generated-apps`
  - `GET /generated-apps`
  - `GET /generated-apps/:appId`
  - `PATCH /generated-apps/:appId/gates`
  - `POST /generated-apps/:appId/public-share`
  - `POST /generated-apps/:appId/public-share/regenerate`
  - `DELETE /generated-apps/:appId/public-share`
- Public API:
  - `GET /generated-apps/public/:token`
  - Must be decorated with `@Public()` and excluded from `TenantMiddleware` in `app.module.ts`.

### 3. Contracts

- `CreateGeneratedAppDto`
  - `prompt`: trimmed string, 1-4000 chars.
  - Initial implementation may use a deterministic normalizer, but it must still produce a structured `AppSpec` with core requirements, pages, data policy, acceptance scenarios, and traceability.
- `RecordGeneratedAppGateResultsDto`
  - `gateResults`: 1-32 gate result objects.
  - `generationPlan`: optional object or null.
  - `preview`: optional object with nullable `previewUrl`, `sourceArtifactUrl`, `testReportUrl`.
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
- Public response must expose only end-user runtime surface:
  - `token`, `appId`, `title`, `description`, `dataUseNotice`, limited `appSpec`, `runtimeSurface`, `createdAt`.
  - Do not expose `gateResults`, `readiness`, `generationPlan`, `sourceArtifactUrl`, `testReportUrl`, `pluginIds`, `publicShareToken`, or creator-only pages.

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
| Creator disables public share | Disable link and clear old token; old URL must immediately stop working |
| Creator regenerates public share | Replace token; old URL must immediately stop working |
| Public token is missing, disabled, or not `published` | Public endpoint returns not found |
| Public app readiness no longer allows publish candidate | Public endpoint rejects rather than serving stale runtime |

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
