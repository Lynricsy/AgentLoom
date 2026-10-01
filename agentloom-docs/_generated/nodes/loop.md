<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `loop`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后开始循环 |
| `state-in` | 初始状态 | `json（接受任意类型）` |  |  | 循环的初始状态输入，未连线时回退到默认 state |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 循环容器执行完成后触发下游节点 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `defaultState` | 默认初始状态 | `object` |  |  |  |
| `outputMode` | 输出模式 | `string` | `"last"` |  | 取值：`none` / `last` / `collect-array` |
| `isCollapsed` | 收起状态 | `boolean` | `false` |  |  |
