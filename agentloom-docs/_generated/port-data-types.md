<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-contracts/src/port-data-type.ts` 的 `PORT_DATA_TYPES`；显示名与端口形状取自 Studio `PORT_DATA_TYPE_META`。

| 值 | 显示名 | 端口形状 |
| --- | --- | --- |
| `model` | Model | `circle` |
| `text` | Text | `circle` |
| `json` | JSON | `square` |
| `array` | Array | `square` |
| `image` | Image | `diamond` |
| `audio` | Audio | `capsule` |
| `tool` | Tool | `hexagon` |
| `sandbox` | Sandbox | `triangle` |
| `knowledge` | Knowledge | `book` |
| `skill` | Skill | `diamond` |
| `agent` | Agent | `circle` |
| `memory` | Memory | `book` |
| `exec` | Exec | `arrow` |
| `volume` | Volume | `square` |
| `runtime-plugin` | Runtime Plugin | `diamond` |

**dataType 兼容矩阵**（来源 `agentloom-contracts/src/port-compatibility.ts` 的 `isPortDataTypeCompatible`；✓ 同类型直连，「可连」为跨类型变换规则允许的连线，空白为不兼容。exec / volume / memory 的专有连线约束与 schema 深层比对不在此表内）：

| 源 \ 目标 | `model` | `text` | `json` | `array` | `image` | `audio` | `tool` | `sandbox` | `knowledge` | `skill` | `agent` | `memory` | `exec` | `volume` | `runtime-plugin` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `model` | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `text` |  | ✓ | 可连（parse_json） |  |  |  |  |  |  |  |  |  |  |  |  |
| `json` |  | 可连（stringify_json） | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |
| `array` |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |
| `image` |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |
| `audio` |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |
| `tool` |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |
| `sandbox` |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |
| `knowledge` |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |
| `skill` |  | 可连（extract_skill_text） |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |
| `agent` |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |
| `memory` |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |
| `exec` |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |
| `volume` |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |
| `runtime-plugin` |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |

**跨类型变换规则**（`PORT_DATA_TYPE_TRANSFORM_RULES`，与 type-engine 同步）。server 执行期用这张表校验连线，并在组装下游输入时执行对应的变换函数；变换失败（如文本不是合法 JSON）时下游收到上游原值，并在该步骤的 `checkpointData.warnings` 中记录 `port-value-transform-failed` 告警：

| 源类型 | 目标类型 | 变换函数 | 原因键 |
| --- | --- | --- | --- |
| `text` | `json` | `parse_json` | `text_to_json_parse` |
| `json` | `text` | `stringify_json` | `json_to_text_stringify` |
| `skill` | `text` | `extract_skill_text` | `skill_to_text_degrade` |
