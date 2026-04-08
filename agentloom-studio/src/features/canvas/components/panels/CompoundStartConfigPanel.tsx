import { memo, useCallback, useMemo } from "react";
import { Play } from "lucide-react";
import { useCanvasActions, useCanvasNodes } from "../../stores/canvasStore";
import {
  buildIterationInputPorts,
  buildIterationStartOutputPorts,
  buildLoopInputPorts,
  buildLoopStartOutputPorts,
  createDefaultIterationStartNodeConfig,
  createDefaultLoopStartNodeConfig,
  getCompoundExtraInputPortIds,
  getNextCompoundExtraInputId,
} from "../../types/controlFlow.types";
import type {
  IterationStartNodeConfig,
  LoopStartNodeConfig,
} from "../../types/controlFlow.types";
import type { PortDefinition } from "../../types/nodeTypeRegistry";
import { CompoundExtraInputEditor } from "./CompoundExtraInputEditor";

interface CompoundStartConfigPanelProps {
  nodeId: string;
  nodeType: "loop-start" | "iteration-start";
  parentId?: string;
  config: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}

type CompoundStartNodeConfig = LoopStartNodeConfig | IterationStartNodeConfig;
type ToggleEntry = readonly [key: string, label: string];

function readPortLabels(
  config: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!config) {
    return undefined;
  }

  const value = config.portLabels;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, string>;
}

export const CompoundStartConfigPanel = memo(function CompoundStartConfigPanel({
  nodeId,
  nodeType,
  parentId,
  config,
  onApply,
}: CompoundStartConfigPanelProps) {
  const nodes = useCanvasNodes();
  const { updateNodeData } = useCanvasActions();
  const parentNode = nodes.find((node) => node.id === parentId);
  const parentInputPorts = useMemo(
    () =>
      (Array.isArray(parentNode?.data.inputPorts)
        ? parentNode.data.inputPorts
        : []) as PortDefinition[],
    [parentNode],
  );
  const extraInputIds = useMemo<readonly string[]>(
    () => (parentNode ? getCompoundExtraInputPortIds(parentInputPorts) : []),
    [parentInputPorts, parentNode],
  );
  const parentPortLabels = useMemo(
    () =>
      readPortLabels(
        parentNode?.data.config as Record<string, unknown> | undefined,
      ),
    [parentNode],
  );

  const parsedConfig = useMemo<CompoundStartNodeConfig>(
    () =>
      nodeType === "loop-start"
        ? {
            ...createDefaultLoopStartNodeConfig(),
            ...(config ?? {}),
          }
        : {
            ...createDefaultIterationStartNodeConfig(),
            ...(config ?? {}),
          },
    [config, nodeType],
  );

  const syncOutputPorts = useCallback(
    (
      nextConfig: CompoundStartNodeConfig,
      nextExtraInputIds = extraInputIds,
      nextPortLabels = parentPortLabels,
    ) => {
      if (nodeType === "loop-start") {
        updateNodeData(nodeId, {
          outputPorts: buildLoopStartOutputPorts(
            nextExtraInputIds,
            nextConfig as LoopStartNodeConfig,
            nextPortLabels,
          ),
        });
        return;
      }

      updateNodeData(nodeId, {
        outputPorts: buildIterationStartOutputPorts(
          nextExtraInputIds,
          nextConfig as IterationStartNodeConfig,
          nextPortLabels,
        ),
      });
    },
    [extraInputIds, nodeId, nodeType, parentPortLabels, updateNodeData],
  );

  const handleToggle = useCallback(
    (key: string) => {
      const nextConfig =
        nodeType === "loop-start"
          ? ({
              ...(parsedConfig as LoopStartNodeConfig),
              [key]: !(
                parsedConfig as LoopStartNodeConfig &
                  Record<keyof LoopStartNodeConfig, boolean>
              )[key as keyof LoopStartNodeConfig],
            } satisfies LoopStartNodeConfig)
          : ({
              ...(parsedConfig as IterationStartNodeConfig),
              [key]: !(
                parsedConfig as IterationStartNodeConfig &
                  Record<keyof IterationStartNodeConfig, boolean>
              )[key as keyof IterationStartNodeConfig],
            } satisfies IterationStartNodeConfig);
      onApply({ config: nextConfig });
      syncOutputPorts(nextConfig);
    },
    [nodeType, onApply, parsedConfig, syncOutputPorts],
  );

  const applyParentPorts = useCallback(
    (
      nextExtraInputIds: readonly string[],
      nextPortLabels: Record<string, string> | undefined,
    ) => {
      if (!parentNode) {
        return;
      }

      updateNodeData(parentNode.id, {
        inputPorts:
          nodeType === "loop-start"
            ? buildLoopInputPorts(nextExtraInputIds, nextPortLabels)
            : buildIterationInputPorts(nextExtraInputIds, nextPortLabels),
        config: {
          ...(parentNode.data.config ?? {}),
          portLabels: nextPortLabels,
        },
      });
    },
    [nodeType, parentNode, updateNodeData],
  );

  const handleAddInputPort = useCallback(() => {
    if (!parentNode) {
      return;
    }

    const nextExtraInputIds = [
      ...extraInputIds,
      getNextCompoundExtraInputId(parentInputPorts),
    ];

    applyParentPorts(nextExtraInputIds, parentPortLabels);
    syncOutputPorts(parsedConfig, nextExtraInputIds, parentPortLabels);
  }, [
    applyParentPorts,
    extraInputIds,
    parentInputPorts,
    parentNode,
    parentPortLabels,
    parsedConfig,
    syncOutputPorts,
  ]);

  const handleMoveInputPort = useCallback(
    (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= extraInputIds.length) {
        return;
      }

      const nextExtraInputIds = [...extraInputIds];
      const current = nextExtraInputIds[index];
      const target = nextExtraInputIds[nextIndex];
      if (!current || !target) {
        return;
      }

      nextExtraInputIds[index] = target;
      nextExtraInputIds[nextIndex] = current;

      applyParentPorts(nextExtraInputIds, parentPortLabels);
      syncOutputPorts(parsedConfig, nextExtraInputIds, parentPortLabels);
    },
    [
      applyParentPorts,
      extraInputIds,
      parentPortLabels,
      parsedConfig,
      syncOutputPorts,
    ],
  );

  const handleRemoveInputPort = useCallback(
    (portId: string) => {
      const nextExtraInputIds = extraInputIds.filter(
        (currentId) => currentId !== portId,
      );
      const nextLabels = parentPortLabels ? { ...parentPortLabels } : undefined;
      if (nextLabels) {
        delete nextLabels[portId];
      }
      const cleanLabels =
        nextLabels && Object.keys(nextLabels).length > 0
          ? nextLabels
          : undefined;

      applyParentPorts(nextExtraInputIds, cleanLabels);
      syncOutputPorts(parsedConfig, nextExtraInputIds, cleanLabels);
    },
    [
      applyParentPorts,
      extraInputIds,
      parentPortLabels,
      parsedConfig,
      syncOutputPorts,
    ],
  );

  const handleRenameInputPort = useCallback(
    (portId: string, label: string, index: number) => {
      const defaultLabel = `输入 ${index + 1}`;
      const nextLabels = { ...(parentPortLabels ?? {}) };
      if (label && label !== defaultLabel) {
        nextLabels[portId] = label;
      } else {
        delete nextLabels[portId];
      }
      const cleanLabels =
        Object.keys(nextLabels).length > 0 ? nextLabels : undefined;

      applyParentPorts(extraInputIds, cleanLabels);
      syncOutputPorts(parsedConfig, extraInputIds, cleanLabels);
    },
    [
      applyParentPorts,
      extraInputIds,
      parentPortLabels,
      parsedConfig,
      syncOutputPorts,
    ],
  );

  const toggleEntries = useMemo<readonly ToggleEntry[]>(
    () =>
      nodeType === "loop-start"
        ? ([
            ["exposePreviousResult", "暴露上一轮结果"],
            ["exposeIsFirst", "暴露首轮标记"],
          ] as const)
        : ([
            ["exposeTotal", "暴露总数"],
            ["exposeIsFirst", "暴露首项标记"],
            ["exposeIsLast", "暴露末项标记"],
          ] as const),
    [nodeType],
  );

  const fixedOutputs = useMemo(
    () =>
      nodeType === "loop-start"
        ? [
            { id: "round", label: "轮次" },
            { id: "state", label: "当前状态" },
          ]
        : [
            { id: "item", label: "当前项" },
            { id: "index", label: "索引" },
          ],
    [nodeType],
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          {nodeType === "loop-start" ? "循环起点" : "迭代起点"}
        </span>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">固定上下文输出</p>
        <p className="text-[10px] leading-5 text-muted-foreground">
          这些端口由运行时自动提供；额外透传端口可在下方编辑，可选增强上下文通过开关按需暴露。
        </p>
        <div className="flex flex-wrap gap-2">
          {fixedOutputs.map((port) => (
            <span
              key={port.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-foreground"
            >
              <span>{port.label}</span>
              <span className="font-mono text-muted-foreground">{port.id}</span>
            </span>
          ))}
        </div>
      </div>

      <CompoundExtraInputEditor
        extraInputIds={extraInputIds}
        portLabels={parentPortLabels}
        title="额外透传端口"
        description={
          parentNode
            ? "这些输出实际对应父容器的额外输入；在这里编辑会同步回父 loop / iteration 节点。"
            : "未找到父容器，暂时无法编辑额外透传端口。"
        }
        emptyText="当前没有额外透传端口。"
        addLabel="添加透传"
        onAdd={handleAddInputPort}
        onMove={handleMoveInputPort}
        onRemove={handleRemoveInputPort}
        onRename={handleRenameInputPort}
      />

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">可选增强输出</p>
        {toggleEntries.map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={
                (parsedConfig as unknown as Record<string, boolean>)[key] ===
                true
              }
              onChange={() => handleToggle(key)}
              className="h-4 w-4 rounded border border-border"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
});
