<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `condition`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发条件判断 |
| `input-0` | 输入 1 | `json（接受任意类型）` |  |  | 第 1 个条件输入口，可接收任意上游端口值并在规则中引用 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `branch-0` | IF | `json` |  |  | 第一个条件匹配时数据从此分支输出 |
| `else` | ELSE | `json` |  |  | 兜底分支，当所有条件均不满足时数据从此输出 |

**配置项**

无静态配置项。
