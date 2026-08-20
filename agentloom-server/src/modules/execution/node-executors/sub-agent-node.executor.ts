/**
 * Sub-agent 节点执行器：拥有任务数据组装、MCP/sandbox/memory 注入与队列投递实现。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ExecutionStep } from '../../../database/schema';
import type { McpRuntimeConnection } from '../../mcp/mcp.service';
import { McpService } from '../../mcp/mcp.service';
import { AGENT_TASK_QUEUE, type AgentTaskJobData } from '../execution.constants';
import { StepStateMachineService } from '../step-state-machine.service';
import {
  extractMcpServerConfigIds,
  extractSmartRoutingContext,
  extractStructuredModelConfigIds,
  isFallbackChainStrategy,
} from '../smart-routing-input.util';
import { getRuntimeNodeData } from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class SubAgentNodeExecutor implements NodeExecutor {
  private readonly logger = new Logger(SubAgentNodeExecutor.name);

  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    @InjectQueue(AGENT_TASK_QUEUE) private readonly agentTaskQueue: Queue,
    @Optional() private readonly mcpService?: McpService,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeSubAgentNode(context);
  }

  async executeSubAgentNode(context: NodeExecutionContext): Promise<void> {
    await this.stepStateMachine.updateStepStatus(
      context.tenantId,
      context.step.id,
      'queued',
    );
    const { data, options } = await this.buildAgentTaskJobData({
      executionId: context.executionId,
      tenantId: context.tenantId,
      step: context.step,
      input: context.input,
      sandboxBinding: context.sandboxBinding,
      memorySessionIds: context.memorySessionIds,
    });
    await this.agentTaskQueue.add('agent-task', data, options);
  }

  private async buildAgentTaskJobData(params: {
    executionId: string;
    tenantId: string;
    step: ExecutionStep;
    input: Record<string, unknown>;
    sandboxBinding?: { executionId: string; sandboxNodeId: string };
    memorySessionIds?: string[];
  }): Promise<{
    data: AgentTaskJobData;
    options?: { attempts: number };
  }> {
    const {
      executionId,
      tenantId,
      step,
      input,
      sandboxBinding,
      memorySessionIds,
    } = params;
    const smartRouting = extractSmartRoutingContext(input);
    const nodeData = getRuntimeNodeData(step.nodeData ?? {});

    if (smartRouting) {
      nodeData.llmModelConfigId = smartRouting.selectedModelId;
    }

    if (
      typeof nodeData.llmModelConfigId !== 'string' ||
      nodeData.llmModelConfigId.length === 0
    ) {
      const fallbackModelId = Object.values(input)
        .flatMap((value) => extractStructuredModelConfigIds(value))
        .at(0);
      if (fallbackModelId) {
        nodeData.llmModelConfigId = fallbackModelId;
      }
    }

    if (
      typeof nodeData.agentId !== 'string' ||
      nodeData.agentId.trim().length === 0
    ) {
      nodeData.agentId = step.nodeId;
    }

    const mcpServers = await this.resolveMcpServersFromInput(input, tenantId);
    const workflowContext: Record<string, unknown> = {};

    if (mcpServers) {
      workflowContext.mcpServers = mcpServers;
    }

    if (sandboxBinding) {
      workflowContext.serverSandbox = sandboxBinding;
    }

    if (memorySessionIds && memorySessionIds.length > 0) {
      workflowContext.memorySessionIds = memorySessionIds;
    }

    return {
      data: {
        executionId,
        stepId: step.id,
        tenantId,
        input,
        nodeData,
        ...(smartRouting ? { smartRouting } : {}),
        ...(sandboxBinding ? { hasSandbox: true } : {}),
        ...(Object.keys(workflowContext).length > 0 ? { workflowContext } : {}),
      },
      ...(isFallbackChainStrategy(smartRouting?.strategy)
        ? { options: { attempts: 1 } }
        : {}),
    };
  }

  private async resolveMcpServersFromInput(
    input: Record<string, unknown>,
    tenantId: string,
  ): Promise<Record<string, McpRuntimeConnection> | undefined> {
    if (!this.mcpService) return undefined;

    const configIds = extractMcpServerConfigIds(input);
    if (configIds.length === 0) return undefined;

    const servers: Record<string, McpRuntimeConnection> = {};

    for (const configId of configIds) {
      try {
        servers[configId] = await this.mcpService.resolveRuntimeConnection(
          configId,
          tenantId,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to resolve MCP server config ${configId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return Object.keys(servers).length > 0 ? servers : undefined;
  }
}
