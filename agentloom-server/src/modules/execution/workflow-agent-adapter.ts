import { Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  agentVersions,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import type { DrizzleDB } from '../../database/database.module';
import type { ExecutionStep, SandboxConfig } from '../../database/schema';
import type { IAgentAdapterFactory as RuntimeAdapterFactory } from '../agent/agent-adapter.factory';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type {
  DecisionEvent,
  StopReason,
} from '../agent/types/agent-event.types';
import {
  ContentBlockSchema,
  type ContentBlock,
} from '../agent/types/content-block.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type {
  AgentRuntimeConfig,
  AgentSubAgentRef,
} from '../agent-definition/agent-runtime-config.interface';
import {
  resolveSubAgent,
  MAX_SUB_AGENT_DEPTH,
} from './node-handlers/sub-agent.handler';
import { EventBridgeService } from './services/event-bridge.service';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';

const MAX_TOOL_ROUNDS = 10;

interface WorkflowAgentAdapterDependencies {
  readonly db: DrizzleDB;
  readonly agentRuntime: IAgentRuntime;
  readonly runtimeAdapterFactory: RuntimeAdapterFactory;
  readonly agentDefinitionService: AgentDefinitionService;
  readonly sandboxService: SandboxService;
  readonly eventBridge: EventBridgeService;
}

interface WorkflowAgentAdapterConfig {
  readonly agentDefinitionId: string;
  readonly sandboxConfig?: SandboxConfig;
}

export interface WorkflowAgentExecutionParams {
  readonly executionId: string;
  readonly step: ExecutionStep;
  readonly input: Record<string, unknown>;
  readonly tenantId: string;
  readonly agentVersionId?: string;
  readonly versionSnapshot?: AgentVersionSnapshot;
  readonly currentDepth?: number;
  readonly visitedIds?: Set<string>;
  readonly sandboxBinding?: { executionId: string };
  readonly emitEvents?: boolean;
}

export interface WorkflowAgentExecutionResult extends Record<string, unknown> {
  readonly content: string;
  readonly stopReason?: string;
  readonly decision?: Record<string, unknown>;
  readonly subAgents?: Record<string, WorkflowAgentExecutionResult>;
}

interface CompiledWorkflowAgentDefinition {
  readonly runtimeConfig: AgentRuntimeConfig;
  readonly systemPrompt?: string;
}

export class WorkflowAgentAdapter {
  private readonly logger = new Logger(WorkflowAgentAdapter.name);
  private readonly tenantDb: DrizzleDB;

  constructor(
    private readonly dependencies: WorkflowAgentAdapterDependencies,
    private readonly config: WorkflowAgentAdapterConfig,
  ) {
    this.tenantDb = getTenantDb(this.dependencies.db);
  }

  async execute(
    params: WorkflowAgentExecutionParams,
  ): Promise<WorkflowAgentExecutionResult> {
    const currentDepth = params.currentDepth ?? 0;
    const emitEvents = params.emitEvents ?? true;
    const visitedIds = new Set(params.visitedIds ?? []);
    visitedIds.add(this.config.agentDefinitionId);

    const compiledDefinition = await this.loadCompiledDefinition({
      agentDefinitionId: this.config.agentDefinitionId,
      tenantId: params.tenantId,
      agentVersionId: params.agentVersionId,
      versionSnapshot: params.versionSnapshot,
    });

    const sandboxBinding = await this.ensureSandboxBinding({
      executionId: params.executionId,
      nodeId: params.step.nodeId,
      tenantId: params.tenantId,
      existingBinding: params.sandboxBinding,
      runtimeConfig: compiledDefinition.runtimeConfig,
    });

    const subAgentResults = await this.executeSubAgents({
      executionId: params.executionId,
      step: params.step,
      tenantId: params.tenantId,
      input: params.input,
      runtimeConfig: compiledDefinition.runtimeConfig,
      currentDepth,
      visitedIds,
      sandboxBinding,
    });

    const promptBlocks = this.buildContentBlocks(params.input, subAgentResults);
    void this.dependencies.agentRuntime;
    const runtime = this.dependencies.runtimeAdapterFactory.selectAdapter(true);

    const session = await runtime.createSession({
      agentId: this.config.agentDefinitionId,
      mode: 'workflow',
      tenantId: params.tenantId,
      llmModelConfigId: compiledDefinition.runtimeConfig.modelConfig?.modelId,
      systemPrompt: compiledDefinition.systemPrompt,
      runtimeConfig: compiledDefinition.runtimeConfig,
      ...(sandboxBinding ? { serverSandbox: sandboxBinding } : {}),
      context: {
        executionId: params.executionId,
        stepId: params.step.id,
        nodeId: params.step.nodeId,
        tenantId: params.tenantId,
        input: params.input,
        ...(sandboxBinding ? { serverSandbox: sandboxBinding } : {}),
      },
    });

    let accumulatedContent = '';
    let decision: Record<string, unknown> | undefined;
    let stopReason: StopReason = 'end_turn';
    let chunkIndex = 0;
    let turnInput = promptBlocks;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      stopReason = 'end_turn';

      for await (const event of runtime.prompt(session.id, turnInput)) {
        if (event.type === 'message_chunk') {
          accumulatedContent += event.content;
          if (emitEvents) {
            this.dependencies.eventBridge.emitOutputChunk(
              params.tenantId,
              params.executionId,
              {
                stepId: params.step.id,
                chunk: event.content,
                index: chunkIndex,
              },
            );
          }
          chunkIndex += 1;
          continue;
        }

        if (emitEvents) {
          this.dependencies.eventBridge.emitStepAgentEvent(
            params.tenantId,
            params.executionId,
            {
              stepId: params.step.id,
              event,
            },
          );
        }

        if (event.type === 'decision') {
          decision = this.toDecisionPayload(event);
          continue;
        }

        if (event.type === 'done') {
          stopReason = event.stopReason;
        }
      }

      if (stopReason !== 'tool_use') {
        break;
      }

      turnInput = [];

      if (round === MAX_TOOL_ROUNDS - 1) {
        throw new Error(
          `Workflow agent ${this.config.agentDefinitionId} exceeded the maximum tool rounds (${MAX_TOOL_ROUNDS})`,
        );
      }
    }

    const result: WorkflowAgentExecutionResult = {
      content: accumulatedContent,
      ...(stopReason !== 'end_turn' ? { stopReason } : {}),
      ...(decision ? { decision } : {}),
      ...(Object.keys(subAgentResults).length > 0
        ? { subAgents: subAgentResults }
        : {}),
    };

    this.logger.debug(
      `Workflow agent ${this.config.agentDefinitionId} completed for step ${params.step.id}`,
    );

    return result;
  }

  private async loadCompiledDefinition(params: {
    agentDefinitionId: string;
    tenantId: string;
    agentVersionId?: string;
    versionSnapshot?: AgentVersionSnapshot;
  }): Promise<CompiledWorkflowAgentDefinition> {
    const definition =
      await this.dependencies.agentDefinitionService.findDetailById(
        params.agentDefinitionId,
      );

    const snapshot =
      params.versionSnapshot ??
      (await this.loadVersionSnapshot(
        params.agentDefinitionId,
        params.tenantId,
        params.agentVersionId ?? definition.publishedVersionId ?? undefined,
      ));

    if (!snapshot) {
      throw new Error(
        `Agent definition "${params.agentDefinitionId}" has no published version snapshot`,
      );
    }

    const runtimeConfig =
      this.dependencies.agentDefinitionService.buildRuntimeConfigFromNodes(
        snapshot.nodes,
        snapshot.edges,
      );

    runtimeConfig.sandboxConfig = resolveAgentRuntimeSandboxConfig(
      this.config.sandboxConfig ??
        snapshot.sandboxConfig ??
        definition.sandboxConfig,
    );

    return {
      runtimeConfig,
      systemPrompt:
        snapshot.systemPrompt ?? definition.systemPrompt ?? undefined,
    };
  }

  private async loadVersionSnapshot(
    agentDefinitionId: string,
    tenantId: string,
    versionId?: string,
  ): Promise<AgentVersionSnapshot | undefined> {
    if (!versionId) {
      return undefined;
    }

    const [version] = await this.tenantDb
      .select({ snapshot: agentVersions.snapshot })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, versionId),
          eq(agentVersions.agentDefinitionId, agentDefinitionId),
          eq(agentVersions.tenantId, tenantId),
        ),
      )
      .limit(1);

    return version?.snapshot ?? undefined;
  }

  private async ensureSandboxBinding(params: {
    executionId: string;
    nodeId: string;
    tenantId: string;
    existingBinding?: { executionId: string };
    runtimeConfig: AgentRuntimeConfig;
  }): Promise<{ executionId: string } | undefined> {
    if (params.existingBinding?.executionId) {
      return params.existingBinding;
    }

    await this.dependencies.sandboxService.createSandboxSession({
      executionId: params.executionId,
      sandboxNodeId: params.nodeId,
      config: params.runtimeConfig.sandboxConfig!,
      tenantId: params.tenantId,
    });

    return { executionId: params.executionId };
  }

  private async executeSubAgents(params: {
    executionId: string;
    step: ExecutionStep;
    tenantId: string;
    input: Record<string, unknown>;
    runtimeConfig: AgentRuntimeConfig;
    currentDepth: number;
    visitedIds: Set<string>;
    sandboxBinding?: { executionId: string };
  }): Promise<Record<string, WorkflowAgentExecutionResult>> {
    const subAgents = params.runtimeConfig.subAgents ?? [];
    if (subAgents.length === 0) {
      return {};
    }

    if (params.currentDepth >= MAX_SUB_AGENT_DEPTH) {
      throw new Error(
        `Sub-agent depth limit exceeded: maximum nesting depth of ${MAX_SUB_AGENT_DEPTH} has been reached`,
      );
    }

    const results: Record<string, WorkflowAgentExecutionResult> = {};

    for (const subAgent of subAgents) {
      const nextVisited = new Set(params.visitedIds);
      const resolved = await resolveSubAgent({
        agentDefinitionId: subAgent.agentDefinitionId,
        ...(subAgent.agentVersionId
          ? { agentVersionId: subAgent.agentVersionId }
          : {}),
        tenantId: params.tenantId,
        currentDepth: params.currentDepth + 1,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: nextVisited,
        agentDefinitionService: this.dependencies.agentDefinitionService,
      });

      if (!resolved.versionSnapshot?.snapshot) {
        throw new Error(
          `Sub-agent "${subAgent.agentDefinitionId}" has no executable version snapshot`,
        );
      }

      const nestedAdapter = this.createNestedAdapter(
        resolved.agentDefinition.id,
      );
      const nestedResult = await nestedAdapter.execute({
        executionId: params.executionId,
        step: params.step,
        input: params.input,
        tenantId: params.tenantId,
        agentVersionId: subAgent.agentVersionId,
        versionSnapshot: resolved.versionSnapshot.snapshot,
        currentDepth: params.currentDepth + 1,
        visitedIds: nextVisited,
        sandboxBinding: params.sandboxBinding,
        emitEvents: false,
      });

      results[this.getSubAgentKey(subAgent)] = nestedResult;
    }

    return results;
  }

  private createNestedAdapter(agentDefinitionId: string): WorkflowAgentAdapter {
    return new WorkflowAgentAdapter(this.dependencies, { agentDefinitionId });
  }

  private getSubAgentKey(subAgent: AgentSubAgentRef): string {
    return subAgent.alias?.trim() || subAgent.agentDefinitionId;
  }

  private toDecisionPayload(event: DecisionEvent): Record<string, unknown> {
    return {
      suggestedContent: event.suggestedContent,
      ...(event.autonomyMode ? { autonomyMode: event.autonomyMode } : {}),
      ...(event.selectedAction ? { selectedAction: event.selectedAction } : {}),
      ...(event.alternatives ? { alternatives: [...event.alternatives] } : {}),
      ...(event.confidence !== undefined
        ? { confidence: event.confidence }
        : {}),
      ...(event.rationale ? { rationale: event.rationale } : {}),
    };
  }

  private buildContentBlocks(
    input: Record<string, unknown>,
    subAgentResults: Record<string, WorkflowAgentExecutionResult>,
  ): ContentBlock[] {
    const payload =
      Object.keys(subAgentResults).length > 0
        ? { input, subAgents: subAgentResults }
        : input;
    const summarizedPayload = this.summarizeForText(payload);
    const modalBlocks = this.collectModalBlocks(input);

    return [
      {
        type: 'text',
        text: JSON.stringify(summarizedPayload),
      },
      ...modalBlocks,
    ];
  }

  private collectModalBlocks(value: unknown): ContentBlock[] {
    const parsed = ContentBlockSchema.safeParse(value);
    if (parsed.success) {
      return parsed.data.type === 'text' ? [] : [parsed.data];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectModalBlocks(item));
    }

    if (this.isRecord(value)) {
      return Object.values(value).flatMap((item) =>
        this.collectModalBlocks(item),
      );
    }

    return [];
  }

  private summarizeForText(value: unknown): unknown {
    const parsed = ContentBlockSchema.safeParse(value);
    if (parsed.success) {
      switch (parsed.data.type) {
        case 'text':
          return parsed.data.text;
        case 'image':
          return `[image:${parsed.data.mimeType}]`;
        case 'audio':
          return `[audio:${parsed.data.mimeType}]`;
        case 'resource':
          return parsed.data.text ?? `[resource:${parsed.data.uri}]`;
        case 'resource_link':
          return parsed.data.title ?? `[resource_link:${parsed.data.uri}]`;
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.summarizeForText(item));
    }

    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.summarizeForText(item),
        ]),
      );
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
