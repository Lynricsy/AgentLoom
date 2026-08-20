/**
 * 节点执行器统一契约：限定 dispatcher 与各执行域之间传递的调度上下文。
 */
import type { ExecutionStep, ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import type { NodeSchedulerService } from '../node-scheduler.service';

export interface NodeExecutionContext {
  readonly executionId: string;
  readonly tenantId: string;
  readonly step: ExecutionStep;
  readonly input: Record<string, unknown>;
  readonly snapshot: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] };
  readonly steps: ExecutionStep[];
  readonly sandboxBinding?: { executionId: string; sandboxNodeId: string };
  readonly memorySessionIds: string[];
  readonly runtime: NodeSchedulerService;
}

export interface NodeExecutor {
  execute(context: NodeExecutionContext): Promise<void>;
}
