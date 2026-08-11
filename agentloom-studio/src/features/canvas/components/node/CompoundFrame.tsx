import { NodeResizer } from "@xyflow/react";
import { Repeat, Repeat2 } from "lucide-react";
import type { LevelOfDetail } from "../../hooks/useLevelOfDetail";
import { COMPOUND_CONTAINER_DEFAULT_SIZE } from "../../types/controlFlow.types";
import type {
  CompoundFrameInsets,
  CompoundLayoutSize,
} from "../../lib/compoundLayout";

interface CompoundFrameProps {
  nodeType: string;
  selected: boolean;
  lod: LevelOfDetail;
  /** 收起态为 null；此时既不渲染 resizer 也不渲染内框 */
  frameInsets: CompoundFrameInsets | null;
  /** 端口数推导出的容器最小尺寸 */
  minimumSize: CompoundLayoutSize | null;
  /** 子节点包围盒推导出的 resize 下限 */
  minResizeSize: CompoundLayoutSize | null;
}

/** loop / iteration 容器：拖拽调整尺寸 + 子图内框 */
export function CompoundFrame({
  nodeType,
  selected,
  lod,
  frameInsets,
  minimumSize,
  minResizeSize,
}: CompoundFrameProps) {
  if (!frameInsets) {
    return null;
  }

  const bodyLabel =
    nodeType === "loop" ? "循环体" : nodeType === "iteration" ? "迭代体" : "容器体";
  const BodyIcon = nodeType === "iteration" ? Repeat2 : Repeat;

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={
          minResizeSize?.width ??
          minimumSize?.width ??
          COMPOUND_CONTAINER_DEFAULT_SIZE.width
        }
        minHeight={
          minResizeSize?.height ??
          minimumSize?.height ??
          COMPOUND_CONTAINER_DEFAULT_SIZE.height
        }
        lineClassName="!border-primary/30"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-primary/50 !bg-surface"
      />

      {lod === "full" ? (
        <div
          className="pointer-events-none absolute flex flex-col overflow-hidden rounded-card border border-dashed"
          style={{
            top: frameInsets.top,
            right: frameInsets.right,
            bottom: frameInsets.bottom,
            left: frameInsets.left,
            borderColor:
              "color-mix(in srgb, var(--node-color, var(--color-border)) 30%, var(--color-border))",
            backgroundColor:
              "color-mix(in srgb, var(--node-color, var(--color-border)) 4%, transparent)",
          }}
        >
          <div className="flex items-center gap-1.5 px-3 py-1">
            <BodyIcon className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
              {bodyLabel}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
