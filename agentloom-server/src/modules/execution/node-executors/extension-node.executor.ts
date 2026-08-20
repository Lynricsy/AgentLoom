/**
 * 扩展节点执行器：拥有 plugin、skill 与 MCP 描述符节点实现。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ExecutionStep } from '../../../database/schema';
import { PluginService } from '../../plugin/plugin.service';
import { PLUGIN_EXECUTION_QUEUE } from '../../plugin/plugin.constants';
import { SkillResolverService } from '../../skill/skill-resolver.service';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { getRuntimeNodeData, isRecord, readFirstString, readStringArray } from '../node-value.util';
import { extractConfiguredMcpTools } from '../workflow-runtime-input.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class ExtensionNodeExecutor implements NodeExecutor {
  private readonly logger = new Logger(ExtensionNodeExecutor.name);
  private readonly handlers = {
    plugin: (c: NodeExecutionContext) => this.executePlugin(c.step, c.input, c.tenantId, c.executionId),
    skill: (c: NodeExecutionContext) => this.executeSkillNode(c.step, c.input, c.tenantId, c.executionId, c.runtime),
    'mcp-tool': (c: NodeExecutionContext) => this.executeMcpToolNode(c.step, c.input, c.tenantId, c.executionId, c.runtime),
  } satisfies Record<string, (context: NodeExecutionContext) => Promise<void>>;

  constructor(
    private readonly pluginService: PluginService,
    @InjectQueue(PLUGIN_EXECUTION_QUEUE) private readonly pluginQueue: Queue,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
    @Optional() @Inject(SkillResolverService)
    private readonly skillResolverService?: SkillResolverService,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.handlers[context.step.nodeType as keyof typeof this.handlers](context);
  }

  async executePlugin(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    const nodeData = isRecord(step.nodeData) ? step.nodeData : {};
    const pluginId =
      typeof nodeData.pluginId === 'string' ? nodeData.pluginId : undefined;
    const pluginNodeType =
      typeof nodeData.pluginNodeType === 'string'
        ? nodeData.pluginNodeType
        : undefined;
    const orgId =
      typeof nodeData.orgId === 'string' ? nodeData.orgId : undefined;

    if (!pluginId || !pluginNodeType) {
      throw new Error('Plugin node missing pluginId or pluginNodeType');
    }

    const plugin = await this.pluginService.findActiveByPluginId(
      pluginId,
      orgId,
      tenantId,
    );

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'queued');

    await this.pluginQueue.add('execute-plugin-node', {
      tenantId,
      executionId,
      stepId: step.id,
      pluginId: plugin.pluginId,
      nodeType: pluginNodeType,
      inputs: input,
      config: isRecord(nodeData.pluginConfig) ? nodeData.pluginConfig : {},
    });
  }

  async executeSkillNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    void input;

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = isRecord(step.nodeData) ? step.nodeData : {};
      const config = isRecord(nodeData.config) ? nodeData.config : nodeData;
      const skillId =
        typeof config.skillId === 'string' && config.skillId.trim().length > 0
          ? config.skillId.trim()
          : undefined;

      if (!skillId) {
        this.logger.warn(`Skill node ${step.nodeId} has no skillId configured`);
        const skillOutput = { warning: 'No skillId configured', skills: [] };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await runtime.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      if (!this.skillResolverService) {
        this.logger.warn(
          `SkillResolverService unavailable for skill node ${step.nodeId}`,
        );
        const skillOutput = {
          warning: 'Skill resolver unavailable',
          skills: [],
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await runtime.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const skills = await this.skillResolverService.resolveSkillsForAgent(
        tenantId,
        [skillId],
      );

      if (skills.length === 0) {
        this.logger.warn(
          `Skill ${skillId} not found or not active for tenant ${tenantId}`,
        );
        const skillOutput = {
          warning: `Skill ${skillId} not found or inactive`,
          skills: [],
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...skillOutput,
              'skill-out': skillOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await runtime.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const skillPayloads = skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        content: skill.content,
      }));
      const skillOutput = { skills: skillPayloads };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...skillOutput,
            'skill-out': skillOutput,
            'exec-out': { triggered: true },
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

  async executeMcpToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    void input;

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const mcpServerConfigId = readFirstString(
        nodeData.mcpServerConfigId,
        nodeData.mcp_server_config_id,
      );
      const enabledToolIds = readStringArray(
        nodeData.enabledToolIds,
        nodeData.enabled_tool_ids,
      );
      const tools = extractConfiguredMcpTools(nodeData, enabledToolIds);
      const selectedTool = tools[0];

      if (!mcpServerConfigId || !selectedTool) {
        this.logger.warn(
          `MCP tool node ${step.nodeId} missing mcpServerConfigId or toolName`,
        );
        const toolOutput = {
          warning: 'MCP tool node missing mcpServerConfigId or toolName',
          type: 'mcp-tool',
        };
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'completed',
          {
            result: {
              ...toolOutput,
              'tool-out': toolOutput,
              'exec-out': { triggered: true },
            },
          },
        );
        await runtime.onNodeCompleted(executionId, step.id, tenantId);
        return;
      }

      const descriptor: Record<string, unknown> = {
        type: 'mcp-tool',
        mcpServerConfigId,
        toolName: selectedTool.toolName,
        tools,
        ...(enabledToolIds.length > 0 ? { enabledToolIds } : {}),
        ...(selectedTool.mcpToolDefinitionId
          ? { mcpToolDefinitionId: selectedTool.mcpToolDefinitionId }
          : {}),
        ...(selectedTool.inputSchema
          ? { inputSchema: selectedTool.inputSchema }
          : {}),
        ...(selectedTool.portMapping
          ? { portMapping: selectedTool.portMapping }
          : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            ...descriptor,
            'tool-out': descriptor,
            'exec-out': { triggered: true },
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
}
