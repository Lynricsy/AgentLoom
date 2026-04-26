# Generated App Studio Contracts

## Scenario: Generated App Creator Workbench

### 1. Scope / Trigger

- Trigger: implementing or modifying `src/features/generated-app/**`, `/generated-apps` routes, Generated App navigation entries, or any Studio UI that creates/enables/regenerates/disables Generated App public links.
- Studio must treat the backend `readiness` object as authoritative. The frontend may explain readiness, but must not invent a separate publish eligibility rule.
- The first surface is a creator workbench, not a marketing page and not a workflow canvas replacement.

### 2. Signatures

- Routes:
  - `/generated-apps`: creator list and one-prompt creation page.
  - `/generated-apps/$appId`: future detail/workbench route for AppSpec, scenarios, gates, artifacts, and submissions.
- API functions:
  - `createGeneratedApp({ prompt })`
  - `listGeneratedApps({ page?, pageSize?, status? })`
  - `getGeneratedApp(appId)`
  - `recordGeneratedAppGateResults(appId, payload)`
  - `enableGeneratedAppPublicShare(appId)`
  - `regenerateGeneratedAppPublicShare(appId)`
  - `disableGeneratedAppPublicShare(appId)`
- Query keys:
  - `generatedAppKeys.all`
  - `generatedAppKeys.lists()`
  - `generatedAppKeys.list(params)`
  - `generatedAppKeys.detail(appId)`

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
  - Public runtime pages must not show `gateResults`, `readiness`, source artifact URLs, test report URLs, plugin permission details, or creator-only pages.
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

### 5. Good / Base / Bad Cases

- Good: a newly created app appears in the list as preview-only, with Gate readiness summary visible and public share disabled.
- Good: a publish candidate row enables the public-share action and mutation invalidates list queries.
- Base: a generated app has warning-only readiness; Studio displays trial/warning summary and keeps public share unavailable.
- Bad: Studio enables share because `status === 'publish_candidate'` while `readiness.canCreatePublicShare` is false.
- Bad: Studio shows an old `publicShareUrl` because `publicShareEnabled=true` even though readiness has fallen back to `blocked`, `trial`, or unsafe `publish_candidate`.
- Bad: Studio hides backend readiness summary and replaces it with a generic "not ready" message only.
- Bad: Studio exposes internal test/source/plugin permission details on an end-user public runtime page.

### 6. Tests Required

- API tests:
  - paths for create/list/detail/gate update/share enable/share regenerate/share disable.
  - Generated App payload casing remains camelCase unless backend changes.
- Query/mutation tests:
  - share enable writes the detail cache and invalidates list queries.
  - create invalidates list queries.
- Component tests:
  - `preview`, `trial`, and `blocked` disable public share and show `readiness.summary`.
  - `publish_candidate + canCreatePublicShare=false` disables public share.
  - `publish_candidate + canCreatePublicShare=true` triggers the share mutation.
  - stale enabled share (`publicShareEnabled=true` + ineligible readiness) hides old public URL and regenerate/open actions.
- Route/navigation smoke:
  - `/generated-apps` route is registered in the route tree.
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
<Button disabled={!canShare}>阻断门禁未全绿不能发布</Button>
```

Correct:

```tsx
<Button disabled={!canShare} title={publishBlockReason}>
  公开分享不可用
</Button>
<p>{app.readiness.summary}</p>
```
