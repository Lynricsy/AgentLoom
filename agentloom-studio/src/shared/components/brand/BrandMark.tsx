import { cn } from "@/shared/lib/utils";

const SIZE_CLASSES = {
  sm: "h-9 w-9 rounded-xl p-1.5",
  md: "h-10 w-10 rounded-xl p-1.5",
  lg: "h-16 w-16 rounded-2xl p-2.5",
} as const;

type BrandMarkSize = keyof typeof SIZE_CLASSES;

interface BrandMarkProps {
  size?: BrandMarkSize;
  className?: string;
  imageClassName?: string;
  alt?: string;
}

export function BrandMark({
  size = "md",
  className,
  imageClassName,
  alt = "AgentLoom logo",
}: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-white/95 shadow-[0_18px_48px_rgba(2,6,23,0.28)] ring-1 ring-white/10",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <img
        src="/brand/logo.png"
        alt={alt}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </div>
  );
}
