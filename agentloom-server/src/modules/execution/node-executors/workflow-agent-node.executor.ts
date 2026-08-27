/**
 * 工作流 Agent 节点执行器：拥有 runtime adapter、sandbox 绑定与 workspace 归档生命周期。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep, ReactFlowEdge } from '../../../database/schema';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { AgentAdapterFactory } from '../adapters/agent-adapter-factory';
import { WorkspaceIntegrationService } from '../../agent-execution/workspace-integration.service';
import { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { InvalidStepTransitionException } from '../execution.exceptions';
import { StepStateMachineService } from '../step-state-machine.service';
import {
  buildWorkflowAgentCheckpointData,
  getExecutionSandboxBinding,
  getWorkflowAgentDefinitionId,
  getWorkflowAgentRuntimeMode,
  getWorkflowSandboxOverride,
} from '../workflow-runtime-input.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class WorkflowAgentNodeExecutor implements NodeExecutor {
  constructor(
    private readonly workflowAgentAdapterFactory: AgentAdapterFactory,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    if (!getWorkflowAgentDefinitionId(context.step.nodeData ?? {})) {
      await context.runtime.failUnschedulableNode(
        context.tenantId,
        context.executionId,
        context.step,
        'agent 节点必须绑定已发布的 Agent Definition；画布上的内联 Agent 配置已不再支持',
      );
      return;
    }
    await this.executeWorkflowAgentNode(context.step, context.input, context.tenantId, context.executionId, context.snapshot.edges, context.steps, context.runtime);
  }

  async executeWorkflowAgentNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
    runtime: NodeSchedulerService,
  ): Promise<void> {
    // 标记步骤是否已落库为 waiting_intervention：此后任何异常都不得再改写步骤状态。
    let pausedForIntervention = false;
    try {
      const nodeData = step.nodeData ?? {};
      const agentDefinitionId = getWorkflowAgentDefinitionId(nodeData);

      if (!agentDefinitionId) {
        throw new Error(
          `Workflow agent node ${step.nodeId} 缺少 agentDefinitionId`,
        );
      }

      const workflowSandboxBinding = getExecutionSandboxBinding(
        step.nodeId,
        executionId,
        edges,
        steps,
        input,
      );
      const workflowAgentRuntimeMode = getWorkflowAgentRuntimeMode(nodeData);
      const usesSandboxRuntime = workflowAgentRuntimeMode === 'sandbox';
      const workflowSandboxNodeId = usesSandboxRuntime
        ? (workflowSandboxBinding?.sandboxNodeId ?? step.nodeId)
        : undefined;
      const runningCheckpointData = buildWorkflowAgentCheckpointData(
        step.checkpointData,
        executionId,
        workflowSandboxNodeId,
      );

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'running',
        {
          checkpointData: runningCheckpointData,
        },
      );
      step.checkpointData = runningCheckpointData;
      if (workflowSandboxNodeId) {
        await this.workspaceIntegrationService.startExecutionStepFileWatcher({
          executionId,
          stepId: step.id,
          tenantId,
          sandboxNodeId: workflowSandboxNodeId,
        });
      }

      const workflowSandboxConfig = workflowSandboxNodeId
        ? getWorkflowSandboxOverride(step.nodeId, edges, steps)
        : undefined;
      const adapter =
        this.workflowAgentAdapterFactory.createFromAgentDefinition(
          agentDefinitionId,
          workflowSandboxConfig,
        );

      const result = await adapter.execute({
        executionId,
        step,
        input,
        tenantId,
        ...(workflowSandboxBinding
          ? { sandboxBinding: workflowSandboxBinding }
          : {}),
        ...(usesSandboxRuntime
          ? { parentUsesSandboxRuntime: true }
          : { parentUsesSandboxRuntime: false }),
        ...(typeof nodeData.agentVersionId === 'string'
          ? { agentVersionId: nodeData.agentVersionId }
          : typeof nodeData.agent_version_id === 'string'
            ? { agentVersionId: nodeData.agent_version_id }
            : {}),
      });
      const effectiveAutonomyMode =
        await this.organizationAutonomyPolicyService.resolveEffectiveAutonomyMode(
          tenantId,
          nodeData,
        );
      const checkpointData = step.checkpointData ?? {};
      const sessionId =
        typeof checkpointData.sessionId === 'string'
          ? checkpointData.sessionId
          : undefined;

      if (
        effectiveAutonomyMode === 'MANUAL_CONFIRM' ||
        result.stopReason === 'intervention_required'
      ) {
        if (!sessionId) {
          throw new Error(
            `Workflow agent node ${step.nodeId} 的干预检查点缺少 sessionId`,
          );
        }

        // MANUAL_CONFIRM 必须在 Agent 产出建议后暂停；提前归档或 completed 会让既有恢复链失去 session。
        // 一旦决定暂停，本步骤的状态所有权就交给干预链路：后续任何异常都只能上抛，不能改写状态。
        pausedForIntervention = true;
        await runtime.pauseForIntervention({
          executionId,
          tenantId,
          step,
          sessionId,
          partialContent: result.content,
          ...(Array.isArray(checkpointData.toolCalls)
            ? { toolCalls: checkpointData.toolCalls }
            : {}),
          ...(Array.isArray(checkpointData.segments)
            ? { segments: checkpointData.segments }
            : {}),
          ...(result.decision ? { decision: result.decision } : {}),
          executionType: 'workflow',
        });
        return;
      }
      const workspaceSnapshotId = workflowSandboxNodeId
        ? await this.workspaceIntegrationService.archiveExecutionStepWorkspace(
            executionId,
            step.id,
            tenantId,
            workflowSandboxNodeId,
          )
        : null;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result,
          checkpointData: buildWorkflowAgentCheckpointData(
            step.checkpointData,
            executionId,
            workflowSandboxNodeId,
            workspaceSnapshotId ?? undefined,
          ),
        },
      );
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      if (error instanceof InvalidStepTransitionException) {
        throw error;
      }

      // 已经暂停等待干预的步骤不能再被写成 failed（waiting_intervention → failed
      // 是非法转换）。若暂停链路自身抛错，在这里二次写 failed 只会把原始错误掩盖成
      // 「步骤状态转换非法」，并把整个 execution 误判为失败。
      if (pausedForIntervention) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const workflowSandboxNodeId =
        getExecutionSandboxBinding(
          step.nodeId,
          executionId,
          edges,
          steps,
          input,
        )?.sandboxNodeId ?? step.nodeId;
      const workspaceSnapshotId =
        await this.workspaceIntegrationService.archiveExecutionStepWorkspace(
          executionId,
          step.id,
          tenantId,
          workflowSandboxNodeId,
        );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'failed',
        {
          errorMessage: {
            message,
            ...(error instanceof Error ? { stack: error.stack } : {}),
            ...(error instanceof DomainException
              ? {
                  type: error.type,
                  title: error.message,
                  detail: error.detail,
                }
              : {}),
            nodeId: step.nodeId,
          },
          checkpointData: buildWorkflowAgentCheckpointData(
            step.checkpointData,
            executionId,
            workflowSandboxNodeId,
            workspaceSnapshotId ?? undefined,
          ),
        },
      );
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );
      await runtime.onNodeFailed(executionId, step.id, tenantId);
    } finally {
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        step.id,
      );
    }
  }
}
