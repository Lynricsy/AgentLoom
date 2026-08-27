import type { PortDataType } from './port-data-type';

/**
 * 端口类型变换规则的 canonical 单一来源。
 *
 * 权威实现是 type-engine 的 Rust checker
 * （`agentloom-type-engine/src/checker/compatibility.rs` 的
 * `CompatibilityChecker::default()`），它同时驱动 WASM 与 Studio 的 JS fallback 深层求值。
 * 这里把同一张表以 wire 形式导出，让 server 的执行期守卫与 Studio 的同步 guard
 * 都从它派生，消除此前四端各写一份、彼此漂移的问题：
 *
 * - Studio 的同步 guard 曾多出 `json<->array`，但 WASM / fallback 的深层求值会拒绝，
 *   用户在画布上本来就连不上；
 * - server 的 `targetType === 'json'` 通配曾让任意类型都能连进 json 端口，
 *   而这样的边在画布上根本造不出来。
 *
 * 新增规则必须先改 Rust，再改这里；`port-compatibility.test.ts` 是机械同步闸门。
 */
export interface PortDataTypeTransformRule {
  readonly sourceKind: PortDataType;
  readonly targetKind: PortDataType;
  /** 与 Rust `reason_key` 对齐，用于 UI 展示变换原因。 */
  readonly reasonKey: string;
  /** 与 Rust `transform_fn` 对齐，运行期实际执行的变换函数名。 */
  readonly transformFn: string;
}

export const PORT_DATA_TYPE_TRANSFORM_RULES: readonly PortDataTypeTransformRule[] =
  [
    {
      sourceKind: 'text',
      targetKind: 'json',
      reasonKey: 'text_to_json_parse',
      transformFn: 'parse_json',
    },
    {
      sourceKind: 'json',
      targetKind: 'text',
      reasonKey: 'json_to_text_stringify',
      transformFn: 'stringify_json',
    },
    {
      sourceKind: 'skill',
      targetKind: 'text',
      reasonKey: 'skill_to_text_degrade',
      transformFn: 'extract_skill_text',
    },
  ] as const;

/**
 * 端口 dataType 级别兼容性判定：同类型恒真，否则查 canonical 变换表。
 *
 * 只做 dataType 粗粒度判定，不含 exec/volume/memory 的专有连线约束（那是 Studio
 * 画布层的额外守卫），也不含 schema 深层结构比对（那是 type-engine 的职责）。
 */
export function isPortDataTypeCompatible(
  sourceType: string,
  targetType: string,
): boolean {
  if (sourceType === targetType) return true;

  return PORT_DATA_TYPE_TRANSFORM_RULES.some(
    (rule) => rule.sourceKind === sourceType && rule.targetKind === targetType,
  );
}
