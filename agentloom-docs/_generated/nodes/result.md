<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `result`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流进入后提交结果 |
| `value-in` | 结果值 | `json（接受任意类型）` |  |  | 要提交给父容器的结果值 |

**输出端口**

无。

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `outputKey` | 输出键 | `string` | `"result"` | 是 |  |
