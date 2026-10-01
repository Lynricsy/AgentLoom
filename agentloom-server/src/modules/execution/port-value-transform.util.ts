/**
 * 跨类型连线的执行期值变换。
 *
 * 哪些跨类型连线合法由 contracts 的 `PORT_DATA_TYPE_TRANSFORM_RULES` 决定（权威来源是
 * type-engine 的 Rust checker）；这里按规则的 `transformFn` 真正改写上游值，
 * 让下游拿到与目标端口 dataType 一致的数据。变换前提不满足时实现抛错，调度器捕获后
 * 透传原值并记录 `PortTransformWarning`，节点不因此失败。
 */
import { PORT_DATA_TYPE_TRANSFORM_RULES } from '@agentloom/contracts';
import { isRecord } from './node-value.util';

/**
 * transformFn → 实现。contracts 新增规则而这里没有实现时，
 * `port-value-transform.util.spec.ts` 会失败，避免执行期静默透传。
 */
export const PORT_VALUE_TRANSFORMS: Readonly<
  Record<string, (value: unknown) => unknown>
> = {
  parse_json: (value) => {
    // 上游已是结构化值（对象、数组、数字等）时无需解析。
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(
        `文本不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`,
      );
    }
  },
  stringify_json: (value) =>
    typeof value === 'string' || value === undefined
      ? value
      : JSON.stringify(value),
  extract_skill_text: (value) => {
    if (typeof value === 'string') return value;
    if (!isRecord(value) || !Array.isArray(value.skills)) {
      throw new Error('上游值不是 { skills: [...] } 形状的技能输出');
    }
    return value.skills
      .filter(isRecord)
      .map((skill) => {
        const body =
          typeof skill.content === 'string' && skill.content.length > 0
            ? skill.content
            : typeof skill.description === 'string'
              ? skill.description
              : '';
        return typeof skill.name === 'string' && skill.name.length > 0
          ? `# ${skill.name}\n\n${body}`
          : body;
      })
      .join('\n\n');
  },
};

/** 查找 source → target 的变换函数名；同类型或无规则时返回 undefined。 */
export function findPortTransformFn(
  sourceType: string,
  targetType: string,
): string | undefined {
  if (sourceType === targetType) return undefined;
  return PORT_DATA_TYPE_TRANSFORM_RULES.find(
    (rule) => rule.sourceKind === sourceType && rule.targetKind === targetType,
  )?.transformFn;
}

/**
 * 跨类型变换失败的告警。变换失败不让节点失败：下游收到上游原值，告警写入下游步骤的
 * `checkpointData.warnings` 并记录服务端日志，供执行详情排查。
 */
export interface PortTransformWarning {
  readonly type: 'port-value-transform-failed';
  readonly message: string;
  readonly transformFn: string;
  readonly edgeId?: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly sourceType: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
  readonly targetType: string;
}
