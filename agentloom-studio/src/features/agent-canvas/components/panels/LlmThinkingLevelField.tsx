import { memo } from 'react';
import {
  AGENT_THINKING_LEVELS,
  AgentThinkingLevelSchema,
  type AgentThinkingLevel,
} from '@agentloom/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

const THINKING_LEVEL_LABELS: Record<AgentThinkingLevel, string> = {
  off: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
};

/** 读取 llm-model 节点 config 中的思考强度；缺省或非法值视为关闭 */
function readThinkingLevel(config: Record<string, unknown>): AgentThinkingLevel {
  const parsed = AgentThinkingLevelSchema.safeParse(config.thinkingLevel);
  return parsed.success ? parsed.data : 'off';
}

interface LlmThinkingLevelFieldProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (level: AgentThinkingLevel) => void;
}

/**
 * Agent 画布 llm-model 节点专属字段：主模型思考强度（pi ThinkingLevel）。
 * 共享的 LlmModelConfigPanel 同时服务 workflow 画布，因此不放在共享面板里。
 */
export const LlmThinkingLevelField = memo(function LlmThinkingLevelField({
  nodeId,
  config,
  onChange,
}: LlmThinkingLevelFieldProps) {
  const fieldId = `llm-thinking-level-${nodeId}`;

  return (
    <section className="mt-4 flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        思考强度
      </label>
      <Select
        value={readThinkingLevel(config)}
        onValueChange={(next) => {
          const parsed = AgentThinkingLevelSchema.safeParse(next);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <SelectTrigger id={fieldId} aria-label="思考强度" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGENT_THINKING_LEVELS.map((level) => (
            <SelectItem key={level} value={level} className="text-xs">
              {THINKING_LEVEL_LABELS[level]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        仅对支持推理（reasoning）的模型生效，其他模型会忽略此设置
      </p>
    </section>
  );
});
