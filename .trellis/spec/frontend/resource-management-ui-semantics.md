# Resource Management UI Semantics

> Studio / Flutter 资源页的默认筛选、标签和展示约定。

---

## 1. Scope / Trigger

- 修改 Studio `workspace` / `sandbox` 资源管理页
- 修改 Flutter `WorkspacesScreen` / `SandboxesScreen`
- 修改资源列表 API 返回的 `sourceKind` / `bindingType` / `timeoutSeconds`

---

## 2. Studio Contracts

### Workspace page

- `WorkspaceManagementPage` 默认请求 `includeAutoArchived=false`
- 页面必须明确提示：默认隐藏 workflow execution 自动归档快照
- `WorkspaceCard` 必须显示来源标签：
  - `常规`
  - `沙箱快照`
  - `执行归档`
- `sizeBytes === null` 时显示 `未知`，不能伪装成 `0 B`

### Sandbox page

- `SandboxManagementPage` 默认请求 `bindingType='resource'`
- 页面必须明确提示：默认只展示真正可复用的资源型沙箱
- persistent sandbox 因 timeout / expiry 被系统回收时，资源页必须显示为 `已停止`，不能显示为 `失败`
- `SandboxCard` 必须显示：
  - lifecycle 标签（持久 / 临时）
  - binding 标签（资源 / 对话 / 执行）
  - timeout 文案：
    - 有 `timeoutSeconds` → `${timeoutSeconds}s`
    - 否则 → `${timeout}h`

---

## 3. Flutter Contracts

- `WorkspacesScreen`
  - 默认 `includeAutoArchived=false`
  - 提供 `显示执行归档` 筛选开关
  - 列表与详情均展示 `sourceLabel`
- `SandboxesScreen`
  - 默认 `bindingType='resource'`
  - 提供 `资源 / 全部 / 对话 / 执行` 绑定筛选
  - 列表与详情均展示 `bindingLabel`
  - timeout 展示遵循与 Studio 相同的秒/小时规则

---

## 4. Validation Matrix

| 场景 | 期望 | 验证点 |
| --- | --- | --- |
| Studio workspace API 调用 | 透传 `includeAutoArchived` | `workspaceApi.test.ts` |
| Studio sandbox API 调用 | 透传 `bindingType` | `sandboxApi.test.ts` |
| Flutter workspace DTO | 正确解析 `sourceKind/isAutoArchived` 并给出中文标签 | `resource_entities_test.dart` |
| Flutter sandbox DTO | 正确解析 `bindingType/timeoutSeconds` 并给出中文标签 | `resource_entities_test.dart` |

---

## 5. Manual QA Focus

- Studio workspace 页默认不应再被 `execution-*-step-*-workspace` 大量占满
- Studio sandbox 页默认不应再把 conversation / execution session 当成“资源沙箱”展示
- persistent 资源沙箱到期后，应显示 `已停止`，而不应被渲染成 `失败`
- Flutter 两个资源页要与 Studio 保持同一套默认语义和标签
