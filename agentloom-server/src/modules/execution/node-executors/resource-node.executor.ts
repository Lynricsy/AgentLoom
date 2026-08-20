/**
 * 资源节点执行器：拥有模型、沙箱、工作区、记忆与知识库节点实现。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep, ReactFlowEdge } from '../../../database/schema';
import { SandboxService } from '../../sandbox/sandbox.service';
import type { MemoryResourceConfig, MemoryResourceInstance } from '../../agent-memory/memory-resource.provider';
import { SharedResourceRegistry } from '../../shared-resources/shared-resource-registry';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { getRuntimeNodeData, readFirstString, readOptionalNumber } from '../node-value.util';
import { resolveMemoryConfig, resolveSandboxConfigForStep } from '../workflow-runtime-input.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class ResourceNodeExecutor implements NodeExecutor {
  private readonly handlers = {
    'llm-model': (c: NodeExecutionContext) => this.executeLlmModelNode(c.step, c.tenantId, c.executionId, c.runtime),
    sandbox: (c: NodeExecutionContext) => this.executeSandboxNode(c.step, c.input, c.tenantId, c.executionId, c.snapshot.edges, c.steps, c.runtime),
    workspace: (c: NodeExecutionContext) => this.executeWorkspaceNode(c.step, c.tenantId, c.executionId, c.runtime),
    memory: (c: NodeExecutionContext) => this.executeMemoryNode(c.step, c.tenantId, c.executionId, c.runtime),
    'knowledge-base': (c: NodeExecutionContext) => this.executeKnowledgeNode(c.step, c.tenantId, c.executionId, c.runtime),
  } satisfies Record<string, (context: NodeExecutionContext) => Promise<void>>;

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly sharedResourceRegistry: SharedResourceRegistry,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.handlers[context.step.nodeType as keyof typeof this.handlers](context);
  }

  async executeLlmModelNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const llmModelConfigId = readFirstString(
        nodeData.llmModelConfigId,
        nodeData.llm_config_id,
        nodeData.modelConfigId,
        nodeData.model_config_id,
      );

      if (!llmModelConfigId) {
        throw new Error('LLM 模型节点缺少 llmModelConfigId');
      }

      const result: Record<string, unknown> = {
        llmModelConfigId,
        modelConfigId: llmModelConfigId,
        modelId: llmModelConfigId,
        ...(readFirstString(nodeData.provider)
          ? { provider: nodeData.provider }
          : {}),
        ...(readFirstString(nodeData.name) ? { name: nodeData.name } : {}),
        ...(readFirstString(nodeData.modelName)
          ? { modelName: nodeData.modelName }
          : {}),
        'exec-out': {
          triggered: true,
          llmModelConfigId,
        },
      };
      const modelOutput = {
        llmModelConfigId: result.llmModelConfigId,
        modelConfigId: result.modelConfigId,
        modelId: result.modelId,
        ...(typeof result.provider === 'string'
          ? { provider: result.provider }
          : {}),
        ...(typeof result.name === 'string' ? { name: result.name } : {}),
        ...(typeof result.modelName === 'string'
          ? { modelName: result.modelName }
          : {}),
      };
      result['model-out'] = modelOutput;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  async executeSandboxNode(
    step: ExecutionStep,
    _input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const config = resolveSandboxConfigForStep(step, edges, steps);

      const session = await this.sandboxService.createSandboxSession({
        executionId,
        sandboxNodeId: step.nodeId,
        config,
        tenantId,
      });
      const sandboxOutput = {
        sessionId: session.id,
        status: session.status,
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...sandboxOutput,
            'sandbox-out': sandboxOutput,
            'exec-out': {
              triggered: true,
              sessionId: session.id,
              status: session.status,
            },
          },
        },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  async executeWorkspaceNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const workspaceId = readFirstString(
        nodeData.workspaceId,
        nodeData.workspace_id,
      );

      if (!workspaceId) {
        throw new Error('Workspace node requires workspaceId');
      }

      const workspaceName = readFirstString(
        nodeData.workspaceName,
        nodeData.workspace_name,
        nodeData.label,
      );
      const workspaceOutput = {
        workspaceId,
        ...(workspaceName ? { workspaceName } : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...workspaceOutput,
            'volume-out': workspaceOutput,
            'exec-out': {
              triggered: true,
              workspaceId,
              ...(workspaceName ? { workspaceName } : {}),
            },
          },
        },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  async executeMemoryNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const config = resolveMemoryConfig(
        step.nodeData ?? {},
        tenantId,
        executionId,
      );
      const instance = await this.sharedResourceRegistry.createResource<
        MemoryResourceConfig,
        MemoryResourceInstance
      >('memory', config);
      const result = {
        sessionId: instance.sessionId,
        instanceId: config.memoryInstanceId,
        role: config.role,
        status: instance.session.status,
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...result,
            'memory-out': result,
            'exec-out': {
              triggered: true,
              sessionId: instance.sessionId,
              instanceId: config.memoryInstanceId,
            },
          },
        },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  async executeKnowledgeNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const knowledgeBaseId = readFirstString(
        nodeData.knowledgeBaseId,
        nodeData.knowledge_base_id,
      );
      const knowledgeBaseName = readFirstString(
        nodeData.knowledgeBaseName,
        nodeData.knowledge_base_name,
      );
      const topK = readOptionalNumber(nodeData.topK, nodeData.top_k);
      const similarityThreshold = readOptionalNumber(
        nodeData.similarityThreshold,
        nodeData.similarity_threshold,
      );

      if (!knowledgeBaseId) {
        throw new Error('Knowledge Base node requires knowledgeBaseId');
      }

      const result: Record<string, unknown> = {
        type: 'knowledge-base',
        knowledgeBaseId,
        ...(knowledgeBaseName ? { knowledgeBaseName } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
        'exec-out': {
          triggered: true,
          knowledgeBaseId,
        },
      };
      const knowledgeOutput = {
        type: 'knowledge-base',
        knowledgeBaseId,
        ...(knowledgeBaseName ? { knowledgeBaseName } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
      };
      result['knowledge-out'] = knowledgeOutput;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }
}
