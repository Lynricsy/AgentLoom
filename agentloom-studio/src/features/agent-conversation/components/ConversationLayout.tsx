import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { panelSlideRight } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_LEFT_RATIO = 0.6;
const MIN_RIGHT_PANE_HEIGHT = 120;
const DEFAULT_RIGHT_TOP_RATIO = 0.6;
/** 键盘方向键每次调整的像素 */
const KEYBOARD_RESIZE_STEP = 16;

function ResizableDivider({
  onResize,
  direction,
  label,
  className,
}: {
  onResize: (delta: number) => void;
  /** 拖动方向：horizontal 左右调宽（竖直分隔线），vertical 上下调高（水平分隔线） */
  direction: "horizontal" | "vertical";
  label: string;
  className?: string;
}) {
  const startPosRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startPosRef.current = direction === "horizontal" ? e.clientX : e.clientY;
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [direction],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    },
    [direction, onResize],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isDraggingRef.current = false;
      (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const [decrease, increase] =
        direction === "horizontal"
          ? ["ArrowLeft", "ArrowRight"]
          : ["ArrowUp", "ArrowDown"];
      if (e.key !== decrease && e.key !== increase) return;
      e.preventDefault();
      onResize(e.key === increase ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP);
    },
    [direction, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      className={cn(
        // 尺寸恒定：热区由伪元素向两侧扩展，hover/拖动只改颜色，不挤动两侧面板
        "relative z-10 shrink-0 touch-none bg-border/40 transition-colors duration-150 before:absolute hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none active:bg-primary/60",
        direction === "horizontal"
          ? "w-1 cursor-col-resize before:inset-y-0 before:-inset-x-1.5"
          : "h-1 cursor-row-resize before:inset-x-0 before:-inset-y-1.5",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    />
  );
}

export interface ConversationLayoutProps {
  hasSandbox: boolean;
  messages: ReactNode;
  composer: ReactNode;
  computerPanel: ReactNode;
  workspacePanel: ReactNode;
}

/**
 * 对话工作区布局：左侧消息 + 输入，右侧（仅沙箱模式、lg 以上）Computer 面板与工作区。
 * 两个方向的分隔条只改本地几何状态，不触发数据层。
 */
export function ConversationLayout({
  hasSandbox,
  messages,
  composer,
  computerPanel,
  workspacePanel,
}: ConversationLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [rightTopHeight, setRightTopHeight] = useState<number | null>(null);

  const handleHorizontalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.offsetWidth;
      // 首次拖动以左栏实际渲染宽度为基准（CSS 60% 可能被 min-w 抬高）
      const leftColumn = container.firstElementChild as HTMLElement | null;
      const current =
        leftWidth ?? leftColumn?.offsetWidth ?? totalW * DEFAULT_LEFT_RATIO;
      const next = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(totalW - MIN_RIGHT_WIDTH, current + delta),
      );
      setLeftWidth(next);
    },
    [leftWidth],
  );

  const handleVerticalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rightColumn = container.querySelector("[data-right-column]");
      if (!rightColumn) return;
      const totalH = rightColumn.clientHeight;
      const current = rightTopHeight ?? totalH * DEFAULT_RIGHT_TOP_RATIO;
      const next = Math.max(
        MIN_RIGHT_PANE_HEIGHT,
        Math.min(totalH - MIN_RIGHT_PANE_HEIGHT, current + delta),
      );
      setRightTopHeight(next);
    },
    [rightTopHeight],
  );

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-w-0 flex-col overflow-hidden",
          // 未拖动前用 CSS 60% 作为首屏宽度（不依赖挂载后测量，避免首屏跳变）；拖动后才写入 px
          hasSandbox
            ? "w-full lg:w-[var(--conversation-left-width,60%)] lg:min-w-[360px] lg:shrink-0"
            : "flex-1",
        )}
        style={
          hasSandbox && leftWidth !== null
            ? ({
                "--conversation-left-width": `${leftWidth}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="flex-1 min-h-0 overflow-hidden">{messages}</div>
        {composer}
      </div>

      <AnimatePresence initial={false}>
        {hasSandbox ? (
          <motion.div
            key="context-pane"
            {...panelSlideRight}
            className="hidden flex-1 lg:flex"
          >
            <ResizableDivider
              onResize={handleHorizontalResize}
              direction="horizontal"
              label="调整对话与工作区面板宽度"
            />

            <div
              data-right-column
              data-testid="agent-conversation-context-pane"
              className="flex flex-1 flex-col overflow-hidden"
              style={{ minWidth: MIN_RIGHT_WIDTH }}
            >
              <div
                className="overflow-hidden"
                style={{
                  height: rightTopHeight ? `${rightTopHeight}px` : "60%",
                }}
              >
                {computerPanel}
              </div>

              <ResizableDivider
                onResize={handleVerticalResize}
                direction="vertical"
                label="调整电脑面板与工作区高度"
              />

              <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 pt-0">
                {workspacePanel}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
