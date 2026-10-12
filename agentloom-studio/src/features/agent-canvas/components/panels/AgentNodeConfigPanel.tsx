import { memo, useCallback, useState, type WheelEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { fadeIn, panelSlideRight } from '@/shared/lib/motion';
import type { CanvasNode, CanvasNodeData } from '@/features/canvas';
import {
  CANVAS_FLOATING_CLASS,
  CanvasPanelHeader,
  CUSTOM_PANEL_REGISTRY,
  getNodeAccentToken,
  resolveNodeIcon,
} from '@/features/canvas';
import { getAgentNodeTypeConfig } from '@/features/canvas/registry/agent-canvas-registry';
import { Button } from '@/shared/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { AgentMainConfigPanel } from './AgentMainConfigPanel';
import { LlmThinkingLevelField } from './LlmThinkingLevelField';
import {
  useAgentCanvasSelectedNodeId,
  useAgentCanvasNodes,
  useAgentCanvasActions,
  useAgentCanvasRuntimeMode,
} from '../../stores/agent-canvas.store';

interface AgentNodeConfigPanelProps {
  className?: string;
}

/**
 * 面板定位：顶部让出 agents.$agentId.tsx 的 agent-top-overlay 工具条（同为 z-30，底边约 64px），
 * 底部与左侧节点面板（AgentCanvas 中 `bottom-4`）留同样的 1rem 间距。
 */
const PANEL_POSITION_CLASS = 'absolute top-20 right-4 z-30 max-h-[calc(100%-6rem)]';

export const AgentNodeConfigPanel = memo(function AgentNodeConfigPanel({
  className,
}: AgentNodeConfigPanelProps) {
  const selectedNodeId = useAgentCanvasSelectedNodeId();
  const nodes = useAgentCanvasNodes();
  const runtimeMode = useAgentCanvasRuntimeMode();
  const { updateNodeData, deleteSelectedNode, selectNode } = useAgentCanvasActions();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handlePatchNode = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, patch as Partial<CanvasNodeData>);
    },
    [selectedNodeId, updateNodeData],
  );
  const handleWheelCapture = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  const nodeData = selectedNode ? (selectedNode.data as CanvasNodeData) : null;
  const isLlmModelNode = nodeData?.nodeType === 'llm-model';

  // 查找共享注册表中的面板
  const customPanel = nodeData
    ? CUSTOM_PANEL_REGISTRY[nodeData.nodeType as string]
    : undefined;
  const nodeTypeConfig = nodeData
    ? getAgentNodeTypeConfig(nodeData.nodeType as string)
    : undefined;
  const accentToken = nodeTypeConfig
    ? getNodeAccentToken(nodeTypeConfig.type, nodeTypeConfig.category)
    : 'var(--color-node-control)';

  // 共享 LLM 面板切换模型时会整体替换 config，需保留 Agent 画布专属的思考强度
  const handleCustomPanelChange = (patch: Record<string, unknown>) => {
    const thinkingLevel = nodeData?.config?.thinkingLevel;
    const patchConfig = patch.config;
    if (
      isLlmModelNode &&
      thinkingLevel !== undefined &&
      patchConfig !== null &&
      typeof patchConfig === 'object'
    ) {
      handlePatchNode({ ...patch, config: { ...patchConfig, thinkingLevel } });
      return;
    }
    handlePatchNode(patch);
  };

  return (
    <>
      <AnimatePresence>
        {selectedNode && nodeData ? (
          <motion.div
            key="agent-node-config"
            initial={panelSlideRight.initial}
            animate={panelSlideRight.animate}
            exit={panelSlideRight.exit}
            transition={panelSlideRight.transition}
            className={cn(
              CANVAS_FLOATING_CLASS,
              PANEL_POSITION_CLASS,
              'flex w-[var(--spacing-property-panel)] flex-col overflow-hidden',
              className,
            )}
          >
            <CanvasPanelHeader
              className="shrink-0"
              icon={resolveNodeIcon(nodeTypeConfig?.icon)}
              tone={accentToken}
              title={nodeData.label}
              description={nodeTypeConfig?.label ?? nodeData.nodeType}
              actions={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="删除节点"
                  className="text-muted-foreground hover:bg-error/10 hover:text-error"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                </Button>
              }
              onClose={() => selectNode(null)}
              closeLabel="关闭节点配置"
            />

            <motion.div
              key={selectedNode.id}
              initial={fadeIn.initial}
              animate={fadeIn.animate}
              transition={fadeIn.transition}
              data-testid="agent-node-config-scroll"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              onWheelCapture={handleWheelCapture}
            >
              {customPanel ? (
                <>
                  {customPanel.render({
                    node: selectedNode as unknown as CanvasNode,
                    onConfigChange: handleCustomPanelChange,
                    onValidationChange: () => {},
                  })}
                  {isLlmModelNode && (
                    <div className="px-4 pb-4">
                      <LlmThinkingLevelField
                        nodeId={selectedNode.id}
                        config={nodeData.config ?? {}}
                        onChange={(thinkingLevel) => {
                          // 「默认」= 移除 thinkingLevel，由运行时按模型能力决定
                          const { thinkingLevel: _previous, ...restConfig } = nodeData.config ?? {};
                          updateNodeData(selectedNode.id, {
                            config:
                              thinkingLevel === null ? restConfig : { ...restConfig, thinkingLevel },
                          });
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <AgentOnlyNodeConfig
                  nodeData={nodeData}
                  runtimeMode={runtimeMode}
                  hasHarnessNode={nodes.some(
                    (node) => (node.data?.nodeType as string | undefined) === 'harness',
                  )}
                  onConfigChange={(config) => updateNodeData(selectedNode.id, { config })}
                />
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>删除节点</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除「{nodeData?.label ?? '该节点'}」吗？与之相连的连线会一并移除。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteSelectedNode();
                setIsDeleteConfirmOpen(false);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

/**
 * Agent Canvas 专属节点配置（不在 CUSTOM_PANEL_REGISTRY 中的类型）
 */
const AgentOnlyNodeConfig = memo(function AgentOnlyNodeConfig({
  nodeData,
  runtimeMode,
  hasHarnessNode,
  onConfigChange,
}: {
  nodeData: CanvasNodeData;
  runtimeMode: 'sandbox' | 'no_sandbox';
  hasHarnessNode: boolean;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeData.nodeType as string) {
    case 'agent-main':
      return (
        <AgentMainConfigPanel
          config={nodeData.config}
          runtimeMode={runtimeMode}
          hasHarnessNode={hasHarnessNode}
          onApply={onConfigChange}
        />
      );
    default:
      return (
        <div className="px-4 py-4 text-xs text-muted-foreground">
          暂不支持配置节点类型 <strong>{nodeData.nodeType}</strong>
        </div>
      );
  }
});

