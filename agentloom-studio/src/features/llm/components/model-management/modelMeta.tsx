import type { ReactNode } from "react";
import { Brain, Eye, FileJson, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ApiProtocol, ModelCapabilities, ModelPricing } from "../../types";

export const PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  openai_chat: "OpenAI Chat",
  openai_responses: "OpenAI Responses",
  anthropic: "Anthropic",
  google: "Google",
  cohere: "Cohere",
};

type ModelMetaTone = "neutral" | "primary" | "info" | "success" | "warning";

const MODEL_META_CHIP_BASE =
  "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium leading-none shadow-sm";

const MODEL_META_CHIP_TONE_CLASS: Record<ModelMetaTone, string> = {
  neutral: "border-border/80 bg-background/90 text-foreground/80",
  primary: "border-primary/35 bg-primary/10 text-primary",
  info: "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  success:
    "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/35 bg-amber-500/14 text-amber-800 dark:text-amber-300",
};

interface PricingBadgeSpec {
  key: string;
  label: string;
  title: string;
  tone: ModelMetaTone;
}

function formatPrice(value: number | undefined | null): string {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
}

function formatTokenThresholdLabel(tokens: number): string {
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M+`;
  if (tokens % 1_000 === 0) return `${tokens / 1_000}K+`;
  return `${tokens}+`;
}

export function buildPricingBadges(pricing: ModelPricing): PricingBadgeSpec[] {
  return [
    {
      key: "input",
      label: `输入 ${formatPrice(pricing.inputPer1MTokens)}`,
      title: `输入 ${formatPrice(pricing.inputPer1MTokens)} / 1M tokens`,
      tone: "info",
    },
    {
      key: "output",
      label: `输出 ${formatPrice(pricing.outputPer1MTokens)}`,
      title: `输出 ${formatPrice(pricing.outputPer1MTokens)} / 1M tokens`,
      tone: "primary",
    },
    ...(pricing.cachedReadPer1MTokens != null
      ? [
          {
            key: "cached-read",
            label: `缓存读 ${formatPrice(pricing.cachedReadPer1MTokens)}`,
            title: `缓存读 ${formatPrice(pricing.cachedReadPer1MTokens)} / 1M tokens`,
            tone: "success" as const,
          },
        ]
      : []),
    ...(pricing.cachedWritePer1MTokens != null
      ? [
          {
            key: "cached-write",
            label: `缓存写 ${formatPrice(pricing.cachedWritePer1MTokens)}`,
            title: `缓存写 ${formatPrice(pricing.cachedWritePer1MTokens)} / 1M tokens`,
            tone: "neutral" as const,
          },
        ]
      : []),
    ...(pricing.tiers ?? []).map((tier, index) => ({
      key: `tier-${index}`,
      label:
        `${formatTokenThresholdLabel(tier.aboveTokens)} ` +
        `入 ${formatPrice(tier.inputPer1MTokens)} · ` +
        `出 ${formatPrice(tier.outputPer1MTokens)}`,
      title:
        `${formatTokenThresholdLabel(tier.aboveTokens)} 以上：` +
        `输入 ${formatPrice(tier.inputPer1MTokens)} / 1M，` +
        `输出 ${formatPrice(tier.outputPer1MTokens)} / 1M`,
      tone: "warning" as const,
    })),
  ];
}

/** 能力 badge 配置 */
export const CAPABILITY_BADGES: {
  key: keyof ModelCapabilities;
  label: string;
  icon: typeof Eye;
}[] = [
  { key: "vision", label: "视觉", icon: Eye },
  { key: "functionCalling", label: "工具调用", icon: Wrench },
  { key: "reasoning", label: "推理", icon: Brain },
  { key: "structuredOutput", label: "结构化", icon: FileJson },
];

interface ModelMetaChipProps {
  children: ReactNode;
  tone?: ModelMetaTone;
  icon?: LucideIcon;
  compact?: boolean;
  numeric?: boolean;
  title?: string;
}

export function ModelMetaChip({
  children,
  tone = "neutral",
  icon: Icon,
  compact = false,
  numeric = false,
  title,
}: ModelMetaChipProps) {
  return (
    <span
      className={cn(
        MODEL_META_CHIP_BASE,
        MODEL_META_CHIP_TONE_CLASS[tone],
        compact && "px-2 py-0.5 text-[10px]",
        numeric && "[font-variant-numeric:tabular-nums]",
      )}
      title={title}
    >
      {Icon ? <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
