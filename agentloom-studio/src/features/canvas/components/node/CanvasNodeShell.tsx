import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Brain } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/shared/lib/utils";
import {
  getLlmConfigState,
  getProviderInfo,
  parseLlmModelConfig,
  ProviderIcon,
  useLlmApiKeys,
} from "@/features/llm";
import { useNodeExecutionState } from "@/features/execution/stores/executionStore";
import type { CanvasNode } from "../../types";
import { getResolvedNodeTypeConfig } from "../../types/nodeTypeRegistry";
import { useLevelOfDetail } from "../../hooks/useLevelOfDetail";
import {
  useCanvasActions,
  useCanvasStore,
  useNodeHasValidationError,
} from "../../stores/canvasStore";
import { NodeExecutionOverlay } from "../NodeExecutionOverlay";
import { usePreviewMode } from "../PreviewModeContext";
import { isCompoundContainerNodeType } from "../../types/controlFlow.types";
import {
  getCompoundFrameInsets,
  resolveCompoundContainerSize,
  computeChildrenBoundingBox,
  computeMinResizeSize,
} from "../../lib/compoundLayout";
import { CompoundFrame } from "./CompoundFrame";
import { NodeBodyRenderer } from "./NodeBodyRenderer";
import {
  NodeCompactHeader,
  NodeFullHeader,
  NodeIconChip,
} from "./NodeHeader";
import {
  MinimalPortAnchors,
  NodeInputPortRows,
  NodeOutputPortRows,
} from "./NodePortRows";
import {
  COMPACT_STATUS_META,
  getNodeColorToken,
  getShellAccentVisual,
  getShellStatus,
  resolveNodeIcon,
} from "./nodeVisualMeta";

export const CanvasNodeShell = memo(function CanvasNodeShell({
  id,
  data,
  selected,
  isConnectable = true,
}: NodeProps<CanvasNode>) {
  const config = getResolvedNodeTypeConfig(data.nodeType, {
    category: data.category,
    inputPorts: Array.isArray(data.inputPorts) ? data.inputPorts : undefined,
    outputPorts: Array.isArray(data.outputPorts) ? data.outputPorts : undefined,
  });
  const NodeTypeIcon = resolveNodeIcon(config.icon);
  const previewMode = usePreviewMode();
  const { data: activeApiKeys = [] } = useLlmApiKeys({
    enabled: !previewMode,
  });
  const liveExecutionState = useNodeExecutionState(id);
  const liveValidationError = useNodeHasValidationError(id);
  const nodeExecutionState = previewMode ? undefined : liveExecutionState;
  const hasValidationError = previewMode ? false : liveValidationError;
  const lod = useLevelOfDetail();
  const llmConfig =
    data.nodeType === "llm-model" ? parseLlmModelConfig(data) : null;
  const hasProviderDefaultKey = useMemo(() => {
    if (!llmConfig) {
      return false;
    }

    return activeApiKeys.some(
      (apiKey) => apiKey.provider === llmConfig.provider && apiKey.isDefault,
    );
  }, [activeApiKeys, llmConfig]);
  const llmState =
    data.nodeType === "llm-model"
      ? getLlmConfigState(data, hasProviderDefaultKey)
      : null;
  const providerInfo = llmConfig ? getProviderInfo(llmConfig.provider) : null;
  const colorToken = getNodeColorToken(
    data.nodeType,
    config.category,
    data.config,
    hasProviderDefaultKey,
  );
  const inputPorts = Array.isArray(data.inputPorts)
    ? data.inputPorts
    : config.inputPorts;
  const outputPorts = Array.isArray(data.outputPorts)
    ? data.outputPorts
    : config.outputPorts;
  const isCompoundContainer = isCompoundContainerNodeType(data.nodeType);
  const isCompoundCollapsed =
    isCompoundContainer && data.config?.isCollapsed === true;
  const compoundMinimumSize = useMemo(
    () =>
      isCompoundContainer
        ? resolveCompoundContainerSize({
            inputPortCount: inputPorts.length,
            outputPortCount: outputPorts.length,
            isCollapsed: isCompoundCollapsed,
          })
        : null,
    [
      inputPorts.length,
      isCompoundCollapsed,
      isCompoundContainer,
      outputPorts.length,
    ],
  );
  const compoundFrameInsets = useMemo(
    () =>
      isCompoundContainer && !isCompoundCollapsed
        ? getCompoundFrameInsets(inputPorts.length, outputPorts.length)
        : null,
    [
      inputPorts.length,
      isCompoundCollapsed,
      isCompoundContainer,
      outputPorts.length,
    ],
  );
  const compoundMinResizeSize = useCanvasStore(
    useCallback(
      (s) => {
        if (previewMode) {
          return null;
        }

        if (!isCompoundContainer || isCompoundCollapsed) {
          return null;
        }

        const frameInsets = getCompoundFrameInsets(
          inputPorts.length,
          outputPorts.length,
        );
        const children = s.nodes.filter((n) => n.parentId === id);
        const bbox = computeChildrenBoundingBox(children);
        const minSize = computeMinResizeSize(bbox, frameInsets);
        return `${minSize.width},${minSize.height}`;
      },
      [
        id,
        inputPorts.length,
        isCompoundCollapsed,
        isCompoundContainer,
        outputPorts.length,
        previewMode,
      ],
    ),
  );
  const parsedMinResize = useMemo(() => {
    if (!compoundMinResizeSize) {
      return null;
    }

    const [w, h] = compoundMinResizeSize.split(",").map(Number);
    return { width: w!, height: h! };
  }, [compoundMinResizeSize]);
  const llmDisplayTitle = llmConfig
    ? llmConfig.name.trim() || llmConfig.modelName.trim() || data.label
    : data.label;
  const subtitle =
    data.nodeType === "llm-model"
      ? llmConfig
        ? (providerInfo?.name ?? llmConfig.provider)
        : "点击配置模型"
      : config.isKnownType
        ? (data.description ?? data.nodeType)
        : config.description;
  const title = data.nodeType === "llm-model" ? llmDisplayTitle : data.label;
  const executionStatus = nodeExecutionState?.status;
  const compactStatusMeta = COMPACT_STATUS_META[executionStatus ?? "idle"];
  const storeEdges = useCanvasStore((s) => s.edges);
  const canvasEdges = previewMode ? previewMode.edges : storeEdges;
  const [showCompletedAccent, setShowCompletedAccent] = useState(
    executionStatus === "completed",
  );
  const shellStatus = getShellStatus(executionStatus, showCompletedAccent);
  const shellAccentClassName = getShellAccentVisual(shellStatus);
  const isMinimal = lod === "minimal";
  const connectedSmartRoutingModelCount = useMemo(() => {
    if (data.nodeType !== "smart-routing") {
      return undefined;
    }

    const modelInputIds = new Set(
      inputPorts
        .filter((port) => port.dataType === "model")
        .map((port) => port.id),
    );

    return canvasEdges.filter(
      (edge) =>
        edge.target === id &&
        (!edge.targetHandle || modelInputIds.has(edge.targetHandle)),
    ).length;
  }, [canvasEdges, data.nodeType, id, inputPorts]);

  const hasSchemaConnection = useMemo(() => {
    if (data.nodeType !== "agent") {
      return false;
    }

    return canvasEdges.some(
      (edge) => edge.target === id && edge.targetHandle === "schema-in",
    );
  }, [canvasEdges, data.nodeType, id]);

  const { setHoveredNodeId, updateNodeData } = useCanvasActions();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveSearchActive = useCanvasStore(
    (s) => s.isSearchOpen && s.searchQuery.length > 0,
  );
  const liveIsMatch = useCanvasStore((s) => s.searchMatchIds.includes(id));
  const liveIsCurrent = useCanvasStore(
    (s) => s.searchMatchIds[s.currentSearchIndex] === id,
  );
  const isSearchActive = previewMode ? false : liveSearchActive;
  const isMatch = previewMode ? false : liveIsMatch;
  const isCurrent = previewMode ? false : liveIsCurrent;

  const onMouseEnter = useCallback(() => {
    if (previewMode) {
      return;
    }

    hoverTimerRef.current = setTimeout(() => {
      setHoveredNodeId(id);
    }, 300);
  }, [id, previewMode, setHoveredNodeId]);

  const onMouseLeave = useCallback(() => {
    if (previewMode) {
      return;
    }

    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredNodeId(null);
  }, [previewMode, setHoveredNodeId]);

  const onToggleCompoundCollapse = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isCompoundContainer) {
        return;
      }

      updateNodeData(id, {
        config: {
          ...data.config,
          isCollapsed: !isCompoundCollapsed,
        },
      });
    },
    [data.config, id, isCompoundCollapsed, isCompoundContainer, updateNodeData],
  );

  useEffect(() => {
    return () => {
      clearTimeout(hoverTimerRef.current ?? undefined);
    };
  }, []);

  useEffect(() => {
    if (executionStatus !== "completed") {
      setShowCompletedAccent(false);
      return;
    }

    setShowCompletedAccent(true);
    const timer = window.setTimeout(() => {
      setShowCompletedAccent(false);
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [executionStatus]);

  const headerBadgeProps = {
    id,
    icon: NodeTypeIcon,
    title,
    statusMeta: compactStatusMeta,
    hasExecutionStatus: executionStatus !== undefined,
    isRunning: executionStatus === "running",
    hasValidationError,
  };

  return (
    <article
      data-lod={lod}
      data-shell-status={shellStatus}
      data-testid={`canvas-node-${id}`}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "canvas-node-shell relative rounded-card border bg-surface text-foreground",
        isCompoundContainer && "h-full w-full",
        lod === "full" && !isCompoundContainer && "min-w-[200px] max-w-[268px]",
        lod === "full" &&
          isCompoundContainer &&
          !isCompoundCollapsed &&
          "max-w-none overflow-hidden",
        lod === "full" &&
          isCompoundContainer &&
          isCompoundCollapsed &&
          "max-w-[360px] overflow-hidden",
        lod === "compact" && "min-w-[156px] max-w-[180px]",
        lod === "minimal" && "h-[80px] min-w-[80px] max-w-[80px]",
        isSearchActive && isMatch && !isCurrent && "search-match",
        isSearchActive && isCurrent && "search-current",
        isSearchActive && !isMatch && "search-dimmed",
      )}
      style={
        {
          "--node-color": colorToken,
          ...(compoundMinimumSize
            ? {
                minWidth: compoundMinimumSize.width,
                minHeight: compoundMinimumSize.height,
              }
            : {}),
        } as CSSProperties
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {shellAccentClassName ? (
        <div
          data-testid={`canvas-node-shell-accent-${id}`}
          data-shell-status={shellStatus}
          className={cn(
            "pointer-events-none absolute inset-y-2 left-0 z-[1] w-1 rounded-full",
            shellAccentClassName,
          )}
        />
      ) : null}

      {!isMinimal && !previewMode ? (
        <NodeExecutionOverlay nodeId={id} />
      ) : null}

      {isCompoundContainer ? (
        <CompoundFrame
          nodeType={data.nodeType}
          selected={!!selected}
          lod={lod}
          frameInsets={compoundFrameInsets}
          minimumSize={compoundMinimumSize}
          minResizeSize={parsedMinResize}
        />
      ) : null}

      {isMinimal ? (
        <div
          data-slot="icon-only"
          className="flex h-full items-center justify-center px-2 py-2"
        >
          <NodeIconChip id={id} icon={NodeTypeIcon} size="full" />
        </div>
      ) : lod === "compact" ? (
        <NodeCompactHeader {...headerBadgeProps} />
      ) : (
        <NodeFullHeader
          {...headerBadgeProps}
          nodeType={data.nodeType}
          subtitle={subtitle}
          overrideIcon={
            data.nodeType === "llm-model" ? (
              llmConfig ? (
                <ProviderIcon provider={llmConfig.provider} size={18} />
              ) : (
                <Brain className="h-[18px] w-[18px]" aria-hidden="true" />
              )
            ) : undefined
          }
          showConfigWarning={
            data.nodeType === "llm-model" && llmState === "warning"
          }
          isCompoundContainer={isCompoundContainer}
          isCompoundCollapsed={isCompoundCollapsed}
          onToggleCompoundCollapse={onToggleCompoundCollapse}
        />
      )}

      {inputPorts.length > 0 ? (
        isMinimal ? (
          <MinimalPortAnchors
            nodeId={id}
            ports={inputPorts}
            isConnectable={isConnectable}
            side="input"
          />
        ) : (
          <NodeInputPortRows
            nodeId={id}
            ports={inputPorts}
            isConnectable={isConnectable}
            isFullDetail={lod === "full"}
          />
        )
      ) : null}

      {lod === "full" ? (
        <NodeBodyRenderer
          id={id}
          data={data}
          llmState={llmState}
          connectedModelCount={connectedSmartRoutingModelCount}
          hasSchemaConnection={hasSchemaConnection}
          fallbackDescription={config.description}
        />
      ) : null}

      {outputPorts.length > 0 ? (
        isMinimal ? (
          <MinimalPortAnchors
            nodeId={id}
            ports={outputPorts}
            isConnectable={isConnectable}
            side="output"
          />
        ) : (
          <NodeOutputPortRows
            nodeId={id}
            ports={outputPorts}
            isConnectable={isConnectable}
            isFullDetail={lod === "full"}
          />
        )
      ) : null}

      <div
        data-slot="state"
        data-state={llmState ?? "idle"}
        className="sr-only"
      >
        {llmState ?? "idle"}
      </div>
    </article>
  );
});
