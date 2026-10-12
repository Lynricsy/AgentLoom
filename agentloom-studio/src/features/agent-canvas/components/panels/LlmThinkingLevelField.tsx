import { memo } from 'react';
import { AgentThinkingLevelSchema, type AgentThinkingLevel } from '@agentloom/contracts';
import { useLlmModelThinkingCapability } from '@/features/llm';
import { resolveProblemDetail } from '@/shared/api/problemDetail';
import { Button } from '@/shared/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

/** 思考强度词表的展示名，仅用于显示；可选项来自模型的思考能力 */
const THINKING_LEVEL_LABELS: Record<AgentThinkingLevel, string> = {
  off: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
};

/** 「默认」选项的哨兵值：选中后从节点 config 中移除 thinkingLevel */
const USE_MODEL_DEFAULT = '__use_model_default__';

/** 读取节点上保存的思考强度；缺省或非法值视为未设置 */
function readStoredThinkingLevel(config: Record<string, unknown>): AgentThinkingLevel | null {
  const parsed = AgentThinkingLevelSchema.safeParse(config.thinkingLevel);
  return parsed.success ? parsed.data : null;
}

function readModelConfigId(config: Record<string, unknown>): string | null {
  const id = config.llmConfigId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

interface LlmThinkingLevelFieldProps {
  nodeId: string;
  config: Record<string, unknown>;
  /** `null` 表示选择「默认」，即从节点 config 中移除 thinkingLevel */
  onChange: (level: AgentThinkingLevel | null) => void;
}

/**
 * Agent 画布 llm-model 节点专属字段：主模型思考强度。
 * 可选强度取自所选模型配置的思考能力（服务端按模型目录判定），不在前端写死。
 * 共享的 LlmModelConfigPanel 同时服务 workflow 画布，因此不放在共享面板里。
 */
export const LlmThinkingLevelField = memo(function LlmThinkingLevelField({
  nodeId,
  config,
  onChange,
}: LlmThinkingLevelFieldProps) {
  const fieldId = `llm-thinking-level-${nodeId}`;
  const modelConfigId = readModelConfigId(config);
  const storedLevel = readStoredThinkingLevel(config);
  const capabilityQuery = useLlmModelThinkingCapability(modelConfigId);
  const capability = modelConfigId ? capabilityQuery.data : undefined;

  const levels = capability?.status === 'supported' ? capability.levels : [];
  const storedUnsupported =
    capability !== undefined && storedLevel !== null && !levels.includes(storedLevel);
  // 模型不支持思考或能力未知时，仍允许把节点上残留的强度清回「默认」
  const selectable = capability !== undefined && (levels.length > 0 || storedLevel !== null);

  let placeholder = '不可用';
  if (!modelConfigId) {
    placeholder = '先选择模型';
  } else if (capability === undefined) {
    placeholder = capabilityQuery.isError ? '思考能力获取失败' : '正在获取模型思考能力…';
  }

  return (
    <section className="mt-4 flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        思考强度
      </label>
      <Select
        value={selectable ? (storedLevel ?? USE_MODEL_DEFAULT) : ''}
        disabled={!selectable}
        onValueChange={(next) => {
          if (next === USE_MODEL_DEFAULT) {
            onChange(null);
            return;
          }
          const parsed = AgentThinkingLevelSchema.safeParse(next);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <SelectTrigger id={fieldId} aria-label="思考强度" className="h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={USE_MODEL_DEFAULT} className="text-xs">
            默认
          </SelectItem>
          {levels.map((level) => (
            <SelectItem key={level} value={level} className="text-xs">
              {THINKING_LEVEL_LABELS[level]}
            </SelectItem>
          ))}
          {storedUnsupported && storedLevel !== null && (
            <SelectItem value={storedLevel} className="text-xs">
              {`${THINKING_LEVEL_LABELS[storedLevel]}（当前模型不支持）`}
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {modelConfigId && capability === undefined && capabilityQuery.isError && (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-xs text-error">
            {resolveProblemDetail(capabilityQuery.error, '获取模型思考能力失败')}
          </p>
          <Button
            variant="outline"
            size="xs"
            className="shrink-0"
            onClick={() => void capabilityQuery.refetch()}
          >
            重试
          </Button>
        </div>
      )}
      {capability?.status === 'unsupported' && (
        <p className="text-xs text-muted-foreground">该模型不支持思考</p>
      )}
      {capability?.status === 'unknown' && (
        <p className="text-xs text-muted-foreground">
          未能获取该模型的思考能力（模型目录里没有这个模型）
        </p>
      )}
      {storedUnsupported && storedLevel !== null && (
        <p className="text-xs text-warning">
          {`当前模型不支持「${THINKING_LEVEL_LABELS[storedLevel]}」，运行时会改用最接近的受支持强度；可改选其他强度，或选「默认」清除。`}
        </p>
      )}
      {capability?.status === 'supported' && (
        <p className="text-xs text-muted-foreground">
          「默认」：模型支持关闭思考时不开启，否则使用模型自身的默认强度
          {capability.defaultLevel && (
            <span className="block">{`模型默认：${THINKING_LEVEL_LABELS[capability.defaultLevel]}`}</span>
          )}
        </p>
      )}
    </section>
  );
});
