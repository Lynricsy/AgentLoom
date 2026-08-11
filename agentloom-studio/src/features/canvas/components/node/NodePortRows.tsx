import { useMemo } from "react";
import { Position } from "@xyflow/react";
import { cn } from "@/shared/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import type { PortDefinition } from "../../types/nodeTypeRegistry";
import { TypedPort } from "../TypedPort";
import { getMinimalHandleOffsets } from "./nodeVisualMeta";

const PORT_LABEL_CLASS = "truncate text-[11px] text-muted-foreground";

function PortLabel({
  port,
  side,
}: {
  port: PortDefinition;
  side: "input" | "output";
}) {
  const className = cn(PORT_LABEL_CLASS, side === "input" ? "ml-3" : "mr-3");

  if (!port.description) {
    return <span className={className}>{port.label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{port.label}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56">
        {port.description}
      </TooltipContent>
    </Tooltip>
  );
}

interface NodePortRowsProps {
  nodeId: string;
  ports: PortDefinition[];
  isConnectable: boolean;
  /** full LOD 才显示端口标签，并使用更宽松的行高 */
  isFullDetail: boolean;
}

/** 输入端口行：端口在左，标签在右 */
export function NodeInputPortRows({
  nodeId,
  ports,
  isConnectable,
  isFullDetail,
}: NodePortRowsProps) {
  return (
    <section data-slot="inputs" className="py-1">
      <TooltipProvider delayDuration={400}>
        {ports.map((port) => (
          <div
            key={port.id}
            className={cn(
              "port-row relative flex items-center pl-0 pr-3",
              isFullDetail ? "h-6" : "h-4",
            )}
          >
            <TypedPort
              nodeId={nodeId}
              port={port}
              position={Position.Left}
              isConnectable={isConnectable}
            />
            {isFullDetail ? <PortLabel port={port} side="input" /> : null}
          </div>
        ))}
      </TooltipProvider>
    </section>
  );
}

/** 输出端口行：标签在左，端口在右 */
export function NodeOutputPortRows({
  nodeId,
  ports,
  isConnectable,
  isFullDetail,
}: NodePortRowsProps) {
  return (
    <section data-slot="outputs" className="py-1">
      <TooltipProvider delayDuration={400}>
        {ports.map((port) => (
          <div
            key={port.id}
            className={cn(
              "port-row relative flex items-center justify-end pl-3 pr-0",
              isFullDetail ? "h-6" : "h-4",
            )}
          >
            {isFullDetail ? <PortLabel port={port} side="output" /> : null}
            <TypedPort
              nodeId={nodeId}
              port={port}
              position={Position.Right}
              isConnectable={isConnectable}
            />
          </div>
        ))}
      </TooltipProvider>
    </section>
  );
}

/** minimal LOD：不渲染端口行，只保留纵向均分的连线锚点 */
export function MinimalPortAnchors({
  nodeId,
  ports,
  isConnectable,
  side,
}: {
  nodeId: string;
  ports: PortDefinition[];
  isConnectable: boolean;
  side: "input" | "output";
}) {
  const offsets = useMemo(
    () => getMinimalHandleOffsets(ports.length),
    [ports.length],
  );
  const isInput = side === "input";

  return (
    <div
      className={cn(
        "absolute inset-y-2 z-[2] w-0",
        isInput ? "left-0" : "right-0",
      )}
    >
      {ports.map((port, index) => (
        <div
          key={port.id}
          className={cn(
            "minimal-port-anchor absolute h-4 w-0",
            isInput ? "left-0" : "right-0",
          )}
          style={{ top: offsets[index], transform: "translateY(-50%)" }}
        >
          <TypedPort
            nodeId={nodeId}
            port={port}
            position={isInput ? Position.Left : Position.Right}
            isConnectable={isConnectable}
          />
        </div>
      ))}
    </div>
  );
}
