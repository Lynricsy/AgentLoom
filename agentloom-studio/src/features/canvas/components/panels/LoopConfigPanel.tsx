import { memo, useCallback, useMemo } from "react";
import { Repeat } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useCanvasActions, useCanvasNodes } from "../../stores/canvasStore";
import type { PortDefinition } from "../../types/nodeTypeRegistry";
import {
  buildLoopInputPorts,
  buildLoopStartOutputPorts,
  createDefaultLoopCompoundNodeConfig,
  createDefaultLoopStartNodeConfig,
  getCompoundExtraInputPortIds,
  getNextCompoundExtraInputId,
} from "../../types/controlFlow.types";
import { CompoundExtraInputEditor } from "./CompoundExtraInputEditor";

interface LoopConfigPanelProps {
  nodeId: string;
  inputPorts: PortDefinition[];
  config: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}

function parseLoopConfig(config: Record<string, unknown>) {
  const defaults = createDefaultLoopCompoundNodeConfig();
  const portLabels =
    config.portLabels &&
    typeof config.portLabels === "object" &&
    !Array.isArray(config.portLabels)
      ? (config.portLabels as Record<string, string>)
      : undefined;
  return {
    ...defaults,
    ...(config ?? {}),
    portLabels,
  };
}

function stringifyDefaultState(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function parseDefaultState(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export const LoopConfigPanel = memo(function LoopConfigPanel({
  nodeId,
  inputPorts,
  config,
  onApply,
}: LoopConfigPanelProps) {
  const nodes = useCanvasNodes();
  const { updateNodeData } = useCanvasActions();
  const parsed = useMemo(() => parseLoopConfig(config), [config]);
  const extraInputIds = useMemo(
    () => getCompoundExtraInputPortIds(inputPorts),
    [inputPorts],
  );

  const syncStartNodePorts = useCallback(
    (
      nextExtraInputIds: readonly string[],
      nextPortLabels = parsed.portLabels,
    ) => {
      const startNode = nodes.find(
        (node) =>
          node.parentId === nodeId && node.data.nodeType === "loop-start",
      );
      if (!startNode) {
        return;
      }

      updateNodeData(startNode.id, {
        outputPorts: buildLoopStartOutputPorts(
          nextExtraInputIds,
          {
            ...createDefaultLoopStartNodeConfig(),
            ...(startNode.data.config ?? {}),
          },
          nextPortLabels,
        ),
      });
    },
    [nodeId, nodes, parsed.portLabels, updateNodeData],
  );

  const handleOutputModeChange = useCallback(
    (value: string) => {
      onApply({
        config: {
          ...parsed,
          outputMode: value,
        },
      });
    },
    [onApply, parsed],
  );

  const handleCollapsedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onApply({
        config: {
          ...parsed,
          isCollapsed: event.target.checked,
        },
      });
    },
    [onApply, parsed],
  );

  const handleDefaultStateChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onApply({
        config: {
          ...parsed,
          defaultState: parseDefaultState(event.target.value),
        },
      });
    },
    [onApply, parsed],
  );

  const handleAddInputPort = useCallback(() => {
    const nextExtraInputIds = [
      ...extraInputIds,
      getNextCompoundExtraInputId(inputPorts),
    ];
    onApply({
      inputPorts: buildLoopInputPorts(nextExtraInputIds, parsed.portLabels),
      config: parsed,
    });
    syncStartNodePorts(nextExtraInputIds);
  }, [extraInputIds, inputPorts, onApply, parsed, syncStartNodePorts]);

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
      onApply({
        inputPorts: buildLoopInputPorts(nextExtraInputIds, parsed.portLabels),
        config: parsed,
      });
      syncStartNodePorts(nextExtraInputIds);
    },
    [extraInputIds, onApply, parsed, syncStartNodePorts],
  );

  const handleRemoveInputPort = useCallback(
    (portId: string) => {
      const nextExtraInputIds = extraInputIds.filter(
        (currentId) => currentId !== portId,
      );
      const nextLabels = parsed.portLabels
        ? { ...parsed.portLabels }
        : undefined;
      if (nextLabels) {
        delete nextLabels[portId];
      }
      const cleanLabels =
        nextLabels && Object.keys(nextLabels).length > 0
          ? nextLabels
          : undefined;
      onApply({
        inputPorts: buildLoopInputPorts(nextExtraInputIds, cleanLabels),
        config: { ...parsed, portLabels: cleanLabels },
      });
      syncStartNodePorts(nextExtraInputIds, cleanLabels);
    },
    [extraInputIds, onApply, parsed, syncStartNodePorts],
  );

  const handleRenameInputPort = useCallback(
    (portId: string, label: string, index: number) => {
      const defaultLabel = `输入 ${index + 1}`;
      const nextLabels = { ...(parsed.portLabels ?? {}) };
      if (label && label !== defaultLabel) {
        nextLabels[portId] = label;
      } else {
        delete nextLabels[portId];
      }
      const cleanLabels =
        Object.keys(nextLabels).length > 0 ? nextLabels : undefined;
      onApply({
        inputPorts: buildLoopInputPorts(extraInputIds, cleanLabels),
        config: { ...parsed, portLabels: cleanLabels },
      });
      syncStartNodePorts(extraInputIds, cleanLabels);
    },
    [extraInputIds, onApply, parsed, syncStartNodePorts],
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">循环容器</span>
      </div>

      <CompoundExtraInputEditor
        extraInputIds={extraInputIds}
        portLabels={parsed.portLabels}
        title="额外输入端口"
        description="这些输入会同步映射到内部 `loop-start` 节点输出。"
        emptyText="当前没有额外输入端口。"
        addLabel="添加输入"
        onAdd={handleAddInputPort}
        onMove={handleMoveInputPort}
        onRemove={handleRemoveInputPort}
        onRename={handleRenameInputPort}
      />

      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          默认初始状态
        </label>
        <textarea
          rows={4}
          value={stringifyDefaultState(parsed.defaultState)}
          onChange={handleDefaultStateChange}
          placeholder='可输入 JSON，例如 {"count":0}'
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          当 `state-in` 未连线时，循环运行会回退到这里定义的默认 state。
        </p>
      </div>

      <div>
        <label
          htmlFor="loop-output-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          输出模式
        </label>
        <Select value={parsed.outputMode} onValueChange={handleOutputModeChange}>
          <SelectTrigger id="loop-output-mode" aria-label="输出模式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">纯控制流</SelectItem>
            <SelectItem value="last">保留最后一次结果</SelectItem>
            <SelectItem value="collect-array">收集为数组</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={parsed.isCollapsed}
          onChange={handleCollapsedChange}
          className="h-4 w-4 rounded border border-border"
        />
        <span>保存为收起态</span>
      </label>
    </div>
  );
});
