import { memo, useCallback } from "react";
import { Container } from "lucide-react";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";
import { Input } from "@/shared/ui/input";
import { normalizeSandboxConversationIdleAutoEndMinutes } from "@/shared/lib/sandboxConversationIdleAutoEnd";
import type { AgentGlobalSandboxConfig } from "@/features/agent/types";

/**
 * 沙箱节点的画布配置：canonical `SandboxConfig` 的可编辑子集，
 * 外加节点级开关 `enabled`（server `extractSandboxConfig` 用它决定是否产出沙箱配置，
 * 该开关本身不属于 `SandboxConfig`）。
 */
type SandboxNodeConfig = { enabled: boolean } & Required<
  Pick<
    AgentGlobalSandboxConfig,
    "cpu" | "memory" | "timeoutSeconds" | "conversationIdleAutoEndMinutes"
  >
>;

interface SandboxNodeConfigPanelProps {
  config: Record<string, unknown>;
  onApply: (config: Record<string, unknown>) => void;
}

const CPU_LIMITS = { min: 0.5, max: 8, step: 0.5 } as const;
const MEMORY_LIMITS = { min: 128, max: 8192, step: 128 } as const;
const TIMEOUT_LIMITS = { min: 0, max: 604800, step: 30 } as const;
const IDLE_AUTO_END_LIMITS = { min: 1, max: 1440 } as const;

function normalizeTimeoutSeconds(value: unknown): number {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.min(TIMEOUT_LIMITS.max, Math.ceil(numericValue));
}

function formatTimeoutSeconds(timeoutSeconds: number): string {
  return timeoutSeconds > 0 ? `${timeoutSeconds}s` : "不超时";
}

function parseSandboxConfig(raw: Record<string, unknown>): SandboxNodeConfig {
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    cpu: typeof raw.cpu === "number" ? raw.cpu : 1,
    memory: typeof raw.memory === "number" ? raw.memory : 512,
    timeoutSeconds: normalizeTimeoutSeconds(raw.timeoutSeconds),
    conversationIdleAutoEndMinutes:
      normalizeSandboxConversationIdleAutoEndMinutes(
        raw.conversationIdleAutoEndMinutes,
      ),
  };
}

interface ConfigSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

const ConfigSlider = memo(function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: ConfigSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-xs font-mono text-neutral-300">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
      />
    </div>
  );
});

export const SandboxNodeConfigPanel = memo(function SandboxNodeConfigPanel({
  config,
  onApply,
}: SandboxNodeConfigPanelProps) {
  const sandbox = parseSandboxConfig(config);

  /** 只允许写入 contracts 定义的 canonical 键，避免再次引入旧别名。 */
  const patchField = useCallback(
    <K extends keyof SandboxNodeConfig>(
      field: K,
      value: SandboxNodeConfig[K],
    ) => {
      onApply({ ...config, [field]: value });
    },
    [config, onApply],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Container className="h-4 w-4 text-orange-400" />
        <span className="text-xs font-medium text-neutral-200">沙箱配置</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">启用沙箱</span>
        <Switch
          checked={sandbox.enabled}
          onCheckedChange={(checked) => patchField("enabled", checked)}
        />
      </div>

      {sandbox.enabled && (
        <>
          <ConfigSlider
            label="CPU"
            value={sandbox.cpu}
            {...CPU_LIMITS}
            unit=" cores"
            onChange={(v) => patchField("cpu", v)}
          />

          <ConfigSlider
            label="内存"
            value={sandbox.memory}
            {...MEMORY_LIMITS}
            unit=" MB"
            onChange={(v) => patchField("memory", v)}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">任务超时</span>
              <span className="text-xs font-mono text-neutral-300">
                {formatTimeoutSeconds(sandbox.timeoutSeconds)}
              </span>
            </div>
            <Input
              type="number"
              min={TIMEOUT_LIMITS.min}
              max={TIMEOUT_LIMITS.max}
              step={TIMEOUT_LIMITS.step}
              value={sandbox.timeoutSeconds}
              onChange={(event) =>
                patchField(
                  "timeoutSeconds",
                  normalizeTimeoutSeconds(event.target.value),
                )
              }
            />
            <p className="text-xs leading-5 text-neutral-500">
              设为 0 表示不超时；如需显式限制，请输入秒数。
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">对话空闲自动结束</span>
              <span className="text-xs font-mono text-neutral-300">
                {sandbox.conversationIdleAutoEndMinutes} min
              </span>
            </div>
            <Input
              type="number"
              min={IDLE_AUTO_END_LIMITS.min}
              max={IDLE_AUTO_END_LIMITS.max}
              value={sandbox.conversationIdleAutoEndMinutes}
              onChange={(event) =>
                patchField(
                  "conversationIdleAutoEndMinutes",
                  normalizeSandboxConversationIdleAutoEndMinutes(
                    Number(event.target.value),
                  ),
                )
              }
            />
            <p className="text-xs leading-5 text-neutral-500">
              沙箱内没有运行中的对话，且所有对话都空闲后，按这个分钟数自动结束对话。
            </p>
          </div>

          <div className="rounded border border-neutral-700 bg-neutral-800/50 px-2.5 py-2 text-xs text-neutral-400">
            <span className="text-neutral-300 font-medium">当前配置：</span>
            {sandbox.cpu} 核 · {sandbox.memory} MB ·{" "}
            {formatTimeoutSeconds(sandbox.timeoutSeconds)} · 空闲{" "}
            {sandbox.conversationIdleAutoEndMinutes} 分钟自动结束
          </div>
        </>
      )}
    </div>
  );
});
