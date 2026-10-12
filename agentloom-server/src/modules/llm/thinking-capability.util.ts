import type { Api as PiApi, Model as PiModel } from '@earendil-works/pi-ai';
import type { z } from 'zod';

import {
  AGENT_THINKING_LEVELS,
  type AgentThinkingLevel,
} from '../agent-definition/agent-runtime-config.interface';
import type { ModelThinkingCapabilitySchema } from './dto/model-thinking-capability.dto';

/** `GET /llm-models/:id/thinking-capability` 的响应体（camelCase，wire 为 snake_case）。 */
export type ModelThinkingCapability = z.infer<
  typeof ModelThinkingCapabilitySchema
>;

type ThinkingCapabilitySource = Exclude<
  ModelThinkingCapability,
  { status: 'unknown' }
>['source'];

/** pi-ai `Model.thinkingLevelMap`：null = 该强度不支持；off 为 null 时不下发推理参数。 */
export type PiThinkingLevelMap = Partial<
  Record<AgentThinkingLevel, string | null>
>;

/**
 * dsh `PiAiModelProfile.reasoningEfforts`：false = 不推理；字典的 key 即可选强度，
 * value 为 wire 拼写，只有 `off` 可为 null（= 什么都不发）。
 */
export type DshReasoningEfforts =
  false | Partial<Record<AgentThinkingLevel, string | null>>;

/** pi Model 上与思考相关的字段；unknown 时沿用 server 合成模型的旧行为（reasoning: true、无 map）。 */
export type PiModelThinkingFields = {
  reasoning: boolean;
  thinkingLevelMap?: PiThinkingLevelMap;
};

export interface ThinkingCapabilityResolution {
  capability: ModelThinkingCapability;
  /** no-sandbox 运行态写入 pi Model 的思考字段 */
  piModel: PiModelThinkingFields;
  /** sandbox models.json 的 reasoningEfforts；unknown 时省略 */
  reasoningEfforts?: DshReasoningEfforts;
}

export const UNKNOWN_THINKING_CAPABILITY: ThinkingCapabilityResolution = {
  capability: { status: 'unknown' },
  piModel: { reasoning: true },
};

type SupportedThinkingInput = {
  source: ThinkingCapabilitySource;
  levels: readonly AgentThinkingLevel[];
  defaultLevel: AgentThinkingLevel | null;
  /** off 的 wire 拼写：provider 接受显式 none 时为字符串，否则 null（不下发推理参数） */
  offWireSpelling: string | null;
  /** pi map 中非 off 强度的拼写（缺省 = 强度名本身） */
  piSpelling?: (level: AgentThinkingLevel) => string | undefined;
};

function isThinkingLevel(value: unknown): value is AgentThinkingLevel {
  return (
    typeof value === 'string' &&
    (AGENT_THINKING_LEVELS as readonly string[]).includes(value)
  );
}

/** LiteLLM 用 `none` 表示关闭思考，统一映射到词表的 `off`。 */
function normalizeLiteLLMEffort(value: unknown): AgentThinkingLevel | null {
  if (value === 'none') return 'off';
  return isThinkingLevel(value) ? value : null;
}

function unsupportedResolution(
  source: ThinkingCapabilitySource,
): ThinkingCapabilityResolution {
  return {
    capability: { status: 'unsupported', source },
    piModel: { reasoning: false },
    reasoningEfforts: false,
  };
}

function supportedResolution(
  input: SupportedThinkingInput,
): ThinkingCapabilityResolution {
  const supported = new Set(input.levels);
  const levels = AGENT_THINKING_LEVELS.filter((level) => supported.has(level));
  if (levels.length === 0) {
    return unsupportedResolution(input.source);
  }

  const thinkingLevelMap: PiThinkingLevelMap = {};
  for (const level of AGENT_THINKING_LEVELS) {
    if (!supported.has(level)) {
      thinkingLevelMap[level] = null;
      continue;
    }
    if (level === 'off') {
      // off 受支持：显式 none 写成字符串；否则留空，由 pi 按协议默认关闭思考
      if (input.offWireSpelling !== null) {
        thinkingLevelMap.off = input.offWireSpelling;
      }
      continue;
    }
    const spelling = input.piSpelling?.(level) ?? level;
    // pi 只把显式映射为字符串的 xhigh/max 视为受支持
    if (spelling !== level || level === 'xhigh' || level === 'max') {
      thinkingLevelMap[level] = spelling;
    }
  }

  return {
    capability: {
      status: 'supported',
      levels,
      defaultLevel:
        input.defaultLevel && supported.has(input.defaultLevel)
          ? input.defaultLevel
          : null,
      source: input.source,
    },
    piModel: { reasoning: true, thinkingLevelMap },
    reasoningEfforts: buildDshReasoningEfforts(levels, input.offWireSpelling),
  };
}

/**
 * dsh 校验规则：只有 off 可为 null，其余值必须是非空字符串（强度名）；字典至少含一个非 off
 * 强度，否则 guest 丢弃该字段 —— 仅支持 off 时输出 false（不推理）。
 */
function buildDshReasoningEfforts(
  levels: readonly AgentThinkingLevel[],
  offWireSpelling: string | null,
): DshReasoningEfforts {
  if (!levels.some((level) => level !== 'off')) {
    return false;
  }

  const efforts: Partial<Record<AgentThinkingLevel, string | null>> = {};
  for (const level of levels) {
    efforts[level] = level === 'off' ? offWireSpelling : level;
  }
  return efforts;
}

/**
 * 从一条 LiteLLM `model_prices_and_context_window.json` 条目推导思考能力。
 *
 * - 无 `supports_reasoning` → unsupported
 * - 有 `reasoning_effort_levels` → 以该列表为准（`none` → off）
 * - 否则 low/medium/high 为基础：`supports_low_reasoning_effort === false` 去掉 low；
 *   minimal/xhigh/max 只在对应 flag 为 true 时加入；off 在
 *   `supports_none_reasoning_effort === false` 或 `thinking_always_on === true` 时去掉
 * - defaultLevel 取 `default_reasoning_effort`（`none` → off），不在 levels 内则为 null
 */
export function deriveLiteLLMThinkingCapability(
  entry: Record<string, unknown>,
): ThinkingCapabilityResolution {
  if (entry.supports_reasoning !== true) {
    return unsupportedResolution('litellm');
  }

  const explicitLevels = Array.isArray(entry.reasoning_effort_levels)
    ? entry.reasoning_effort_levels
    : null;

  let levels: AgentThinkingLevel[];
  if (explicitLevels) {
    levels = explicitLevels
      .map(normalizeLiteLLMEffort)
      .filter((level): level is AgentThinkingLevel => level !== null);
  } else {
    levels = ['medium', 'high'];
    if (entry.supports_low_reasoning_effort !== false) levels.push('low');
    if (entry.supports_minimal_reasoning_effort === true) {
      levels.push('minimal');
    }
    if (entry.supports_xhigh_reasoning_effort === true) levels.push('xhigh');
    if (entry.supports_max_reasoning_effort === true) levels.push('max');
    if (
      entry.supports_none_reasoning_effort !== false &&
      entry.thinking_always_on !== true
    ) {
      levels.push('off');
    }
  }

  const acceptsExplicitNone =
    entry.supports_none_reasoning_effort === true ||
    (explicitLevels?.includes('none') ?? false);

  return supportedResolution({
    source: 'litellm',
    levels,
    defaultLevel: normalizeLiteLLMEffort(entry.default_reasoning_effort),
    offWireSpelling: acceptsExplicitNone ? 'none' : null,
  });
}

/**
 * 从 pi-ai 内置目录的模型推导思考能力；levels 由 pi 的 `getSupportedThinkingLevels`
 * 计算，保证与 pi 运行时 clamp 语义一致。目录没有默认强度，defaultLevel 恒为 null。
 */
export function derivePiCatalogThinkingCapability(
  model: PiModel<PiApi>,
  getSupportedThinkingLevels: (model: PiModel<PiApi>) => string[],
): ThinkingCapabilityResolution {
  if (!model.reasoning) {
    return unsupportedResolution('pi-catalog');
  }

  const map = model.thinkingLevelMap ?? {};
  const offSpelling = map.off;

  return supportedResolution({
    source: 'pi-catalog',
    levels: getSupportedThinkingLevels(model).filter(isThinkingLevel),
    defaultLevel: null,
    offWireSpelling: typeof offSpelling === 'string' ? offSpelling : null,
    piSpelling: (level) => {
      const spelling = map[level];
      return typeof spelling === 'string' ? spelling : undefined;
    },
  });
}
