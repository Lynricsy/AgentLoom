import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/shared/lib/utils";

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_LEFT_RATIO = 0.6;
const MIN_RIGHT_PANE_HEIGHT = 120;
const DEFAULT_RIGHT_TOP_RATIO = 0.6;

function ResizableDivider({
  onResize,
  direction,
  className,
}: {
  onResize: (delta: number) => void;
  direction: "horizontal" | "vertical";
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

  return (
    <div
      className={cn(
        "shrink-0 bg-border/40 transition-colors hover:bg-primary/40 active:bg-primary/60",
        direction === "horizontal"
          ? "w-1 cursor-col-resize hover:w-1.5"
          : "h-1 cursor-row-resize hover:h-1.5",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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

  const initLeftWidth = useCallback(() => {
    if (leftWidth !== null) return leftWidth;
    const container = containerRef.current;
    if (!container) return MIN_LEFT_WIDTH;
    return container.offsetWidth * DEFAULT_LEFT_RATIO;
  }, [leftWidth]);

  const handleHorizontalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.offsetWidth;
      const current = leftWidth ?? totalW * DEFAULT_LEFT_RATIO;
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

  const currentLeftWidth = leftWidth ?? initLeftWidth();

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-w-0 flex-col overflow-hidden",
          hasSandbox
            ? "w-full lg:w-[var(--conversation-left-width)] lg:min-w-[360px] lg:shrink-0"
            : "flex-1",
        )}
        style={
          hasSandbox
            ? ({
                "--conversation-left-width": `${currentLeftWidth}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="flex-1 min-h-0 overflow-hidden">{messages}</div>
        {composer}
      </div>

      {hasSandbox ? (
        <>
          <ResizableDivider
            className="hidden lg:flex"
            onResize={handleHorizontalResize}
            direction="horizontal"
          />

          <div
            data-right-column
            data-testid="agent-conversation-context-pane"
            className="hidden flex-1 flex-col overflow-hidden lg:flex"
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
            />

            <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 pt-0">
              {workspacePanel}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
