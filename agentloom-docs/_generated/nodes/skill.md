<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `skill`，分类 Agent。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后解析 Skill 内容 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，Skill 节点完成后触发下游节点 |
| `skill-out` | Skill | `skill` |  |  | 预定义的能力模板，连接后 Agent 在对话中可按需激活使用 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `skillId` | Skill ID | `string` |  | 是 | 关联的技能 ID |
| `skillName` | 技能名称 | `string` |  |  |  |
| `skillDescription` | 技能描述 | `string` |  |  |  |
