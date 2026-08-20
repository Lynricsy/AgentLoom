import type { CanvasNode, PluginNodeData, SmartRoutingNodeData } from "../../types";
import type { AgentNodeData as WorkflowAgentNodeData } from "@/features/agent";
import { isCompoundSpecialNodeType } from "../../types/controlFlow.types";
import { KnowledgeBaseNodeBody } from "../nodes/KnowledgeBaseNodeBody";
import { LlmModelNodeBody } from "../nodes/LlmModelNodeBody";
import { McpToolNodeBody } from "../nodes/McpToolNodeBody";
import { ReusableBlockBody } from "../nodes/ReusableBlockBody";
import { SandboxNodeBody } from "../nodes/SandboxNodeBody";
import { SmartRoutingNodeBody } from "../nodes/SmartRoutingNodeBody";
import { PluginNodeBody } from "../nodes/PluginNodeBody";
import { AgentNodeBody } from "../nodes/AgentNodeBody";
import { MemoryNodeBody } from "../nodes/MemoryNodeBody";
import { WorkspaceNodeBody } from "../nodes/WorkspaceNodeBody";
import { InputPreprocessorNodeBody } from "../nodes/InputPreprocessorNodeBody";
import { ConditionNodeBody } from "../nodes/ConditionNodeBody";
import { ControlFlowSpecialNodeBody } from "../nodes/ControlFlowSpecialNodeBody";
import { IterationNodeBody } from "../nodes/IterationNodeBody";
import { LoopNodeBody } from "../nodes/LoopNodeBody";
import { MergeNodeBody } from "../nodes/MergeNodeBody";
import { HttpToolNodeBody } from "../nodes/HttpToolNodeBody";
import { CodeToolNodeBody } from "../nodes/CodeToolNodeBody";
import { ManualTriggerNodeBody } from "../nodes/ManualTriggerNodeBody";
import { ScheduleTriggerNodeBody } from "../nodes/ScheduleTriggerNodeBody";
import { WebhookTriggerNodeBody } from "../nodes/WebhookTriggerNodeBody";
import { ApiEventTriggerNodeBody } from "../nodes/ApiEventTriggerNodeBody";
import { TextNodeBody } from "../nodes/TextNodeBody";
import { TextOutputNodeBody } from "../nodes/TextOutputNodeBody";
import { JsonOutputNodeBody } from "../nodes/JsonOutputNodeBody";
import { SkillBody } from "../../../agent-canvas/components/nodes/SkillBody";
import { SubAgentNodeBody } from "../../../agent-canvas/components/nodes/SubAgentNodeBody";
import type { LlmVisualState } from "./nodeVisualMeta";

interface NodeBodyRendererProps {
  id: string;
  data: CanvasNode["data"];
  llmState: LlmVisualState | null;
  /** smart-routing 已连接的模型数量 */
  connectedModelCount: number | undefined;
  /** agent 节点是否连了 schema-in */
  hasSchemaConnection: boolean;
  /** 未命中任何 Body 组件时的兜底文案 */
  fallbackDescription: string;
}

/** full LOD 下按 `data.nodeType` 分发到各节点 Body 组件 */
export function NodeBodyRenderer({
  id,
  data,
  llmState,
  connectedModelCount,
  hasSchemaConnection,
  fallbackDescription,
}: NodeBodyRendererProps) {
  return (
    <div data-slot="body" className="px-3 py-2 text-xs text-muted-foreground">
      {data.nodeType === "llm-model" ? (
        <LlmModelNodeBody source={data} state={llmState ?? "unconfigured"} />
      ) : data.nodeType === "mcp-tool" ? (
        <McpToolNodeBody data={data} />
      ) : data.nodeType === "knowledge-base" ? (
        <KnowledgeBaseNodeBody config={data.config} />
      ) : data.nodeType === "sandbox" ? (
        <SandboxNodeBody data={data} />
      ) : data.nodeType === "reusable-block" ? (
        <ReusableBlockBody nodeId={id} data={data} />
      ) : data.nodeType === "smart-routing" ? (
        <SmartRoutingNodeBody
          data={data as SmartRoutingNodeData}
          connectedModelCount={connectedModelCount}
        />
      ) : data.nodeType === "plugin" ? (
        <PluginNodeBody data={data as PluginNodeData} />
      ) : data.nodeType === "memory" ? (
        <MemoryNodeBody config={data.config} />
      ) : data.nodeType === "workspace" ? (
        <WorkspaceNodeBody config={data.config} />
      ) : data.nodeType === "agent" ? (
        <AgentNodeBody
          data={data as WorkflowAgentNodeData}
          hasSchemaConnection={hasSchemaConnection}
        />
      ) : data.nodeType === "skill" ? (
        <SkillBody data={data} />
      ) : (data.nodeType as string) === "sub-agent" ? (
        <SubAgentNodeBody data={data} />
      ) : data.nodeType === "input-preprocessor" ? (
        <InputPreprocessorNodeBody config={data.config} />
      ) : data.nodeType === "condition" ? (
        <ConditionNodeBody config={data.config} />
      ) : data.nodeType === "loop" ? (
        <LoopNodeBody config={data.config} />
      ) : data.nodeType === "iteration" ? (
        <IterationNodeBody config={data.config} />
      ) : isCompoundSpecialNodeType(data.nodeType) ? (
        <ControlFlowSpecialNodeBody
          nodeType={data.nodeType}
          config={data.config}
        />
      ) : data.nodeType === "merge" ? (
        <MergeNodeBody config={data.config} />
      ) : data.nodeType === "http-tool" ? (
        <HttpToolNodeBody config={data.config} />
      ) : data.nodeType === "code-tool" ? (
        <CodeToolNodeBody config={data.config} />
      ) : data.nodeType === "manual-trigger" ? (
        <ManualTriggerNodeBody config={data.config} />
      ) : data.nodeType === "schedule-trigger" ? (
        <ScheduleTriggerNodeBody config={data.config} />
      ) : data.nodeType === "webhook-trigger" ? (
        <WebhookTriggerNodeBody config={data.config} />
      ) : data.nodeType === "api-event-trigger" ? (
        <ApiEventTriggerNodeBody config={data.config} />
      ) : data.nodeType === "text" ? (
        <TextNodeBody config={data.config} />
      ) : data.nodeType === "text-output" ? (
        <TextOutputNodeBody nodeId={id} />
      ) : data.nodeType === "json-output" ? (
        <JsonOutputNodeBody nodeId={id} />
      ) : (
        fallbackDescription
      )}
    </div>
  );
}
