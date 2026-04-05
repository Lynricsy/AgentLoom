# Resource Management UI Semantics

> Studio / Flutter 资源页的默认筛选、标签和展示约定。

---

## 1. Scope / Trigger

- 修改 Studio `workspace` / `sandbox` 资源管理页
- 修改 Flutter `WorkspacesScreen` / `SandboxesScreen`
- 修改资源列表 API 返回的 `sourceKind` / `bindingType` / `timeoutSeconds`
- 修改 sandbox stats contract（`diskUsage` / `diskTotal`）

---

## 2. Studio Contracts

### Workspace page

- `WorkspaceManagementPage` 默认请求 `includeAutoArchived=false`
- 页面必须明确提示：默认隐藏 workflow execution 自动归档快照，仅展示可复用的手动工作区与沙箱快照
- workspace 列表筛选文案必须使用：
  - `隐藏执行归档`
  - `包含执行归档`
- `WorkspaceCard` 必须显示来源标签：
  - `手动工作区`
  - `沙箱快照`
  - `执行归档`
- `WorkspaceDetailPage` 与 `WorkspaceCard` 必须复用同一套 `sourceKind -> label/badge` 映射，避免“列表一个叫常规、详情另一个叫手动工作区”的同层漂移
- `sizeBytes === null` 时显示 `未知`，不能伪装成 `0 B`

### Share-imported resource pages

- `WorkflowListPage`
  - 顶部必须提供来源筛选：`全部来源 / 自己创建 / 分享导入`
  - 卡片 / 列表项必须显示来源标签
  - `resourceSourceKind === 'share_imported'` 时必须暴露“转为自己创建”动作
- `AgentListPage`
  - 列表必须支持 `sourceKind` 筛选并显示来源标签
  - `resourceSourceKind === 'share_imported'` 时必须暴露“转为自己创建”动作
- `KnowledgeBasesPage` / `MemoryInstancesPage` / `McpServerManagementPage` / `SkillBrowsePage`
  - 列表必须支持 `sourceKind=manual|share_imported`
  - 条目必须展示来源标签
  - `share_imported` 项必须支持“转为自己创建”
- “转为自己创建”只改变分类，不复制新资源、不跳新页；成功后当前列表必须刷新，且当筛选为 `分享导入` 时已转正项应立即消失。
- workflow / agent 分享导入项在页面上读取 `resourceSourceKind`；knowledge / memory / mcp / skill 读取 `sourceKind`。UI 不能把这两个字段混用。

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
- running sandbox 若拿到 `diskUsage/diskTotal`：
  - 必须显示真实字节值
  - `diskUsage=0` 时必须显示 `0 B`
  - 缺失字段时必须视为“未知/不可用”，不能渲染成 `0 B`

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
  - 详情 stats 如果拿到 `diskUsage/diskTotal`，必须显示真实磁盘占用；`diskUsage=0` 时继续显示 `0 B`
- `WorkflowsScreen` / `AgentListScreen` / `KnowledgeBasesScreen` / `MemoryListScreen` / `McpServersScreen` / `SkillListScreen`
  - 必须支持 `全部 / 自己创建 / 分享导入` 来源筛选
  - 卡片 / 详情展示统一来源标签
  - `share_imported` 项必须提供“转为自己创建”操作，并在成功后刷新当前列表/详情

---

## 4. Validation Matrix

| 场景 | 期望 | 验证点 |
| --- | --- | --- |
| Studio workspace API 调用 | 透传 `includeAutoArchived` | `workspaceApi.test.ts` |
| Studio workspace 来源标签 | 卡片与详情页都显示 `手动工作区 / 沙箱快照 / 执行归档` | 组件测试或手动 QA |
| Studio sandbox API 调用 | 透传 `bindingType` | `sandboxApi.test.ts` |
| Studio sandbox stats 展示 | `diskUsage=0` 时显示 `0 B / ...`，不当成缺失 | `SandboxStatsDisplay.test.tsx` |
| Studio workflow / agent 列表来源筛选 | 透传 `sourceKind` 并显示来源标签 | 对应页面测试 |
| Studio 资源页点击“转为自己创建” | 调用 shared `convert-to-manual` 并刷新列表 | 对应页面测试 |
| Flutter workspace DTO | 正确解析 `sourceKind/isAutoArchived` 并给出中文标签 | `resource_entities_test.dart` |
| Flutter sandbox DTO | 正确解析 `bindingType/timeoutSeconds` 并给出中文标签 | `resource_entities_test.dart` |
| Flutter sandbox stats DTO | 正确解析 `diskUsage/diskTotal`，并保留 `0` | `resource_entities_test.dart` |
| Flutter workflow / agent / knowledge / memory / mcp / skill 列表来源筛选 | 正确透传 `sourceKind` 并刷新列表 | screens/provider tests |
| Flutter 分享导入资源转正 | 调用 `resource-sources/:type/:id/convert-to-manual` 后标签刷新 | screens/provider tests |

---

## 5. Manual QA Focus

- Studio workspace 页默认不应再被 `execution-*-step-*-workspace` 大量占满，筛选文案也不能再把“隐藏执行归档”误写成“常规工作区”
- Studio sandbox 页默认不应再把 conversation / execution session 当成“资源沙箱”展示
- persistent 资源沙箱到期后，应显示 `已停止`，而不应被渲染成 `失败`
- running sandbox 写入文件后，Studio 资源页应能看到磁盘占用真实变化；空工作区应显示 `0 B`，而不是空白或伪造值
- Studio workflow / agent / knowledge / memory / mcp / skill 页要能按来源筛选，并在“转为自己创建”后立即反映到当前筛选结果
- Flutter workflow / agent / knowledge / memory / mcp / skill 页要与 Studio 保持同一套来源标签、筛选与转正语义
