<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `sandbox`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后创建或恢复沙箱会话 |
| `volume-in` | 工作区 | `volume` |  |  | 可选挂载持久化工作区，沙箱内的文件读写将保存到该工作区 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，沙箱会话准备完成后触发下游节点 |
| `sandbox-out` | 沙箱 | `sandbox` |  | 不限 | 提供隔离的代码执行环境，连接到 Agent 后可运行代码和终端命令 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `cpu` | CPU | `number` | `1` |  |  |
| `memory` | Memory | `number` | `512` |  |  |
| `disk` | Disk | `number` | `2` |  |  |
| `persistencePath` | Persistence Path | `string` | `""` |  |  |
| `timeout` | Timeout | `number` | `0` |  |  |
