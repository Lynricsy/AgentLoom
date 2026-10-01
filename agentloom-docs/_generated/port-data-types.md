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

**dataType 兼容矩阵**（来源 `agentloom-contracts/src/port-compatibility.ts` 的 `isPortDataTypeCompatible`；✓ 同类型直连，「转换」为运行期自动变换，空白为不兼容。exec / volume / memory 的专有连线约束与 schema 深层比对不在此表内）：

| 源 \ 目标 | `model` | `text` | `json` | `array` | `image` | `audio` | `tool` | `sandbox` | `knowledge` | `skill` | `agent` | `memory` | `exec` | `volume` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `model` | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `text` |  | ✓ | 转换（parse_json） |  |  |  |  |  |  |  |  |  |  |  |
| `json` |  | 转换（stringify_json） | ✓ |  |  |  |  |  |  |  |  |  |  |  |
| `array` |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |
| `image` |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |
| `audio` |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |
| `tool` |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |
| `sandbox` |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |
| `knowledge` |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |
| `skill` |  | 转换（extract_skill_text） |  |  |  |  |  |  |  | ✓ |  |  |  |  |
| `agent` |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |
| `memory` |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |
| `exec` |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |
| `volume` |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |

**自动变换规则**（`PORT_DATA_TYPE_TRANSFORM_RULES`）：

| 源类型 | 目标类型 | 变换函数 | 原因键 |
| --- | --- | --- | --- |
| `text` | `json` | `parse_json` | `text_to_json_parse` |
| `json` | `text` | `stringify_json` | `json_to_text_stringify` |
| `skill` | `text` | `extract_skill_text` | `skill_to_text_degrade` |
