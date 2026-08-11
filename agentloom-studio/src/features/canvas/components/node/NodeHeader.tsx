import type { MouseEvent, ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import { DUR, EASE } from "@/shared/lib/motion";
import { COMPACT_STATUS_META } from "./nodeVisualMeta";

type StatusMeta = (typeof COMPACT_STATUS_META)[keyof typeof COMPACT_STATUS_META];

interface NodeIconChipProps {
  id: string;
  icon: LucideIcon;
  /** llm-model 用 provider 图标替代类型图标 */
  overrideIcon?: ReactNode;
  size: "full" | "compact";
}

/** 类别色图标芯片：类别色 14% 底 + 类别色图标 */
export function NodeIconChip({
  id,
  icon: Icon,
  overrideIcon,
  size,
}: NodeIconChipProps) {
  return (
    <span
      data-testid={`canvas-node-icon-${id}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px]",
        size === "full" ? "h-9 w-9" : "h-8 w-8",
      )}
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--node-color, var(--color-primary)) 14%, transparent)",
        color: "var(--node-color, var(--color-primary))",
      }}
    >
      {overrideIcon ?? (
        <Icon
          className={size === "full" ? "h-[18px] w-[18px]" : "h-4 w-4"}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

interface NodeStatusBadgeProps {
  id: string;
  meta: StatusMeta;
  isRunning: boolean;
}

/** 执行状态徽章：小圆点 + 文案，running 时圆点呼吸 */
function NodeStatusBadge({ id, meta, isRunning }: NodeStatusBadgeProps) {
  return (
    <span
      data-testid={`canvas-node-status-badge-${id}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        meta.className,
      )}
    >
      {isRunning ? (
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: DUR.slow * 4, ease: EASE, repeat: Infinity }}
        />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {meta.label}
    </span>
  );
}

/** 表单校验错误徽章 */
function NodeValidationBadge({ id }: { id: string }) {
  return (
    <span
      data-testid={`canvas-node-validation-badge-${id}`}
      className="inline-flex shrink-0 items-center rounded-full border border-warning/40 bg-warning/15 p-1 text-warning"
    >
      <AlertTriangle className="h-3 w-3" />
    </span>
  );
}

interface NodeHeaderCommonProps {
  id: string;
  icon: LucideIcon;
  title: string;
  statusMeta: StatusMeta;
  /** 无执行态时不渲染状态徽章，避免每个节点常驻「空闲」噪声 */
  hasExecutionStatus: boolean;
  isRunning: boolean;
  hasValidationError: boolean;
}

/** compact LOD 头部：图标芯片 + 标题 + 状态徽章 */
export function NodeCompactHeader({
  id,
  icon,
  title,
  statusMeta,
  hasExecutionStatus,
  isRunning,
  hasValidationError,
}: NodeHeaderCommonProps) {
  return (
    <header
      data-slot="header"
      className={cn(
        "flex items-center gap-2 border-b border-border/60 py-2 pl-2.5",
        // 右上角 NodeExecutionOverlay 常驻该区域，有执行态时预留出位置
        hasExecutionStatus ? "pr-8" : "pr-2.5",
      )}
    >
      <NodeIconChip id={id} icon={icon} size="compact" />
      <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
        {title}
      </h3>
      {hasValidationError ? <NodeValidationBadge id={id} /> : null}
      {hasExecutionStatus ? (
        <NodeStatusBadge id={id} meta={statusMeta} isRunning={isRunning} />
      ) : null}
    </header>
  );
}

interface NodeFullHeaderProps extends NodeHeaderCommonProps {
  nodeType: string;
  subtitle: string;
  /** llm-model 的 provider 图标 */
  overrideIcon?: ReactNode;
  /** llm-model 缺 API Key 时的行内警示 */
  showConfigWarning: boolean;
  isCompoundContainer: boolean;
  isCompoundCollapsed: boolean;
  onToggleCompoundCollapse: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** full LOD 头部：图标芯片 + 类型眉标 / 标题 / 副标题 + 右上角徽章区 */
export function NodeFullHeader({
  id,
  icon,
  overrideIcon,
  nodeType,
  title,
  subtitle,
  statusMeta,
  hasExecutionStatus,
  isRunning,
  hasValidationError,
  showConfigWarning,
  isCompoundContainer,
  isCompoundCollapsed,
  onToggleCompoundCollapse,
}: NodeFullHeaderProps) {
  return (
    <header
      data-slot="header"
      className={cn(
        "flex items-start gap-2.5 border-b border-border/60 py-2.5 pl-3",
        hasExecutionStatus ? "pr-8" : "pr-3",
      )}
    >
      <NodeIconChip
        id={id}
        icon={icon}
        overrideIcon={overrideIcon}
        size="full"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-medium uppercase leading-none tracking-[0.1em] text-muted-foreground/60">
          {nodeType}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <h3 className="truncate text-[13px] font-semibold leading-tight">
            {title}
          </h3>
          {showConfigWarning ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          ) : null}
        </div>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {hasValidationError ? <NodeValidationBadge id={id} /> : null}
        {hasExecutionStatus ? (
          <NodeStatusBadge id={id} meta={statusMeta} isRunning={isRunning} />
        ) : null}
        {isCompoundContainer ? (
          <button
            type="button"
            onClick={onToggleCompoundCollapse}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors duration-150 hover:border-border-hover hover:text-foreground"
            aria-label={isCompoundCollapsed ? "展开容器" : "收起容器"}
            data-testid={`compound-toggle-${id}`}
          >
            {isCompoundCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
}
