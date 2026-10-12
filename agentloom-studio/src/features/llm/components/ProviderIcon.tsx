import { memo, useState } from "react";
import { Bot } from "lucide-react";
import { useTheme, type ResolvedTheme } from "@/shared/hooks/use-theme";
import { cn } from "@/shared/lib/utils";

const LOBEHUB_ICON_BASE = "https://unpkg.com/@lobehub/icons-static-png@latest";
const LEGACY_LOBEHUB_ICON_BASE = "https://icons.lobehub.com/icons/";
const STATIC_LOBEHUB_SVG_ICON_BASE =
  "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/";
const STATIC_LOBEHUB_PNG_ICON_BASE =
  "https://unpkg.com/@lobehub/icons-static-png@latest/";
const NO_ICON_SLUGS = new Set(["custom", "private_cloud"]);
const LOBEHUB_ICON_ASSET_ALIASES: Record<string, string> = {
  anthropic: "claude-color",
  google: "gemini-color",
  deepseek: "deepseek-color",
  mistral: "mistral-color",
  cohere: "cohere-color",
  xai: "grok",
  together: "together-color",
  fireworks: "fireworks-color",
  perplexity: "perplexity-color",
  siliconflow: "siliconcloud-color",
  zhipu: "zhipu-color",
  moonshot: "kimi-color",
  qwen: "qwen-color",
  doubao: "doubao-color",
  minimax: "minimax-color",
  baichuan: "baichuan-color",
  yi: "yi-color",
  stepfun: "stepfun-color",
  hunyuan: "hunyuan-color",
};

/**
 * lobehub 静态 PNG 的 `dark/` 目录是给深色背景用的浅色单色 logo（openai、grok 等），
 * `light/` 目录是给浅色背景用的深色 logo；`*-color` 变体两目录相同。按当前主题选目录。
 */
function resolveProviderIconUrl(
  slug: string,
  iconUrl: string | null | undefined,
  theme: ResolvedTheme,
) {
  const iconAsset = LOBEHUB_ICON_ASSET_ALIASES[slug] ?? slug;
  const isManagedLobeUrl =
    !!iconUrl &&
    (iconUrl.startsWith(LEGACY_LOBEHUB_ICON_BASE) ||
      iconUrl.startsWith(STATIC_LOBEHUB_SVG_ICON_BASE) ||
      iconUrl.startsWith(STATIC_LOBEHUB_PNG_ICON_BASE));

  if (NO_ICON_SLUGS.has(slug) && !iconUrl) {
    return null;
  }

  if (iconUrl && !isManagedLobeUrl) {
    return iconUrl;
  }

  if (NO_ICON_SLUGS.has(slug)) {
    return null;
  }

  return `${LOBEHUB_ICON_BASE}/${theme}/${iconAsset}.png`;
}

interface ProviderIconProps {
  /** Provider slug (e.g., 'openai', 'anthropic') -- used to build lobehub CDN URL */
  slug?: string;
  /** @deprecated Use `slug` instead */
  provider?: string;
  /** Custom icon URL -- if provided, overrides the lobehub CDN URL */
  iconUrl?: string | null;
  /** Icon size in pixels (default: 20) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
}

export const ProviderIcon = memo(function ProviderIcon({
  slug,
  provider,
  iconUrl,
  size = 20,
  className,
}: ProviderIconProps) {
  const [hasError, setHasError] = useState(false);
  const { resolvedTheme } = useTheme();

  const resolvedSlug = slug ?? provider ?? "unknown";
  const src = resolveProviderIconUrl(resolvedSlug, iconUrl, resolvedTheme);

  if (hasError || !src) {
    return (
      <Bot size={size} className={cn("shrink-0 text-foreground/80", className)} />
    );
  }

  return (
    <img
      src={src}
      alt={resolvedSlug}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-xs", className)}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
});
