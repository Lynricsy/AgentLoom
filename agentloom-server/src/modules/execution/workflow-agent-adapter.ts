import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  agentVersions,
  type AgentRuntimeMode,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import type { DrizzleDB } from '../../database/database.module';
import {
  executionSteps,
  workflowExecutions,
  type ExecutionStep,
  type SandboxConfig,
} from '../../database/schema';
import type { IAgentAdapterFactory as RuntimeAdapterFactory } from '../agent/agent-adapter.factory';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type {
  AgentSession,
  ServerSandboxBinding,
} from '../agent/types/agent-session.types';
import type {
  DecisionEvent,
  StopReason,
  AgentEvent,
} from '../agent/types/agent-event.types';
import type { ContentBlock } from '../agent/types/content-block.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type {
  AgentKnowledgeBinding,
  AgentRuntimeConfig,
  AgentMcpToolBinding,
  AgentToolBinding,
  AgentSubAgentRef,
} from '../agent-definition/agent-runtime-config.interface';
import { extractMcpToolDescriptors } from '../agent-definition/mcp-tool-descriptor.utils';
import {
  appendOutputSchemaToSystemPrompt,
  cloneAgentRuntimeConfig,
  coerceAgentOutputSchema,
  mergeRuntimeConfigWithSubAgentRef,
  resolveSubAgentSystemPrompt,
} from '../agent-definition/agent-runtime-config.utils';
import {
  deriveAgentSandboxConfigFromCanvas,
  mergeSandboxConfigCandidates,
} from '../agent-definition/agent-sandbox-config.utils';
import {
  resolveSubAgent,
  MAX_SUB_AGENT_DEPTH,
} from './node-handlers/sub-agent.handler';
import { buildAgentPromptContentBlocks } from './agent-prompt-content.builder';
import { EventBridgeService } from './services/event-bridge.service';
import {
  createPersistedSubAgentStream,
  clonePersistedSubAgentStream,
  completePersistedSubAgentStream,
  normalizeSubAgentEventForPersistence,
  pushPersistedSubAgentEvent,
} from '../agent-execution/subagent/persisted-subagent-stream.utils';
import {
  type ExecuteSubAgentParams,
  type PersistedSubAgentStreamRecord,
  type SubAgentEventEnvelope,
  type SubAgentResult,
  SubAgentRunStatus,
  SubAgentToolsProvider,
} from '../agent-execution/subagent';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import type { SkillPromptPayload } from '../skill/skill.types';
import {
  appendTextConversationMessageSegment,
  appendThinkingConversationMessageSegment,
  ensureToolCallConversationMessageSegment,
  type ConversationMessageSegmentRecord,
} from '../agent-conversation/message-segments';

const MAX_TOOL_ROUNDS = 10;
const PROGRESS_CHECKPOINT_INTERVAL_MS = 400;

interface WorkflowAgentAdapterDependencies {
  readonly db: DrizzleDB;
  readonly agentRuntime: IAgentRuntime;
  readonly runtimeAdapterFactory: RuntimeAdapterFactory;
  readonly agentDefinitionService: AgentDefinitionService;
  readonly sandboxService: SandboxService;
  readonly eventBridge: EventBridgeService;
  readonly subAgentToolsProvider?: SubAgentToolsProvider;
  readonly skillResolverService?: SkillResolverService;
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
  readonly sandboxBinding?: ServerSandboxBinding;
  readonly parentUsesSandboxRuntime?: boolean;
  readonly emitEvents?: boolean;
  readonly subAgentRef?: AgentSubAgentRef;
  readonly subAgentInvocation?: {
    handle: string;
    alias: string;
    parentToolCallId: string;
    task: string;
    context?: string;
  };
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
  readonly runtimeMode: AgentRuntimeMode;
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

    const baseInput = params.subAgentInvocation
      ? {
          'text-in': this.buildSubAgentPrompt(
            params.subAgentInvocation.task,
            params.subAgentInvocation.context,
          ),
        }
      : params.input;
    const compiledDefinition = this.applySubAgentRefToCompiledDefinition(
      await this.loadCompiledDefinition({
        agentDefinitionId: this.config.agentDefinitionId,
        tenantId: params.tenantId,
        agentVersionId: params.agentVersionId,
        versionSnapshot: params.versionSnapshot,
      }),
      params.subAgentRef,
    );
    const {
      runtimeConfig: runtimeConfigWithExtensions,
      systemPrompt,
      sanitizedInput,
    } = await this.resolveWorkflowExtensions({
      tenantId: params.tenantId,
      compiledDefinition,
      input: baseInput,
    });
    if (
      params.parentUsesSandboxRuntime === false &&
      compiledDefinition.runtimeMode === 'sandbox'
    ) {
      throw new Error('无 sandbox Agent 不支持调用有 sandbox 的子 Agent');
    }
    const usesSandboxRuntime =
      compiledDefinition.runtimeMode === 'sandbox' ||
      (compiledDefinition.runtimeMode === 'no_sandbox' &&
        params.parentUsesSandboxRuntime === true);
    const effectiveRuntimeConfig =
      compiledDefinition.runtimeMode === 'no_sandbox' && usesSandboxRuntime
        ? {
            ...runtimeConfigWithExtensions,
            nativeToolPolicy: this.buildReadOnlyNativeToolPolicy(),
          }
        : runtimeConfigWithExtensions;
    const sandboxBinding =
      compiledDefinition.runtimeMode === 'sandbox'
        ? await this.ensureSandboxBinding({
            executionId: params.executionId,
            nodeId: params.step.nodeId,
            tenantId: params.tenantId,
            existingBinding: params.sandboxBinding,
            runtimeConfig: effectiveRuntimeConfig,
          })
        : usesSandboxRuntime
          ? params.sandboxBinding
          : undefined;

    if (usesSandboxRuntime && !sandboxBinding) {
      throw new Error('当前子 Agent 缺少可复用的 sandbox 绑定');
    }

    const promptBlocks = this.buildContentBlocks(sanitizedInput);
    const runtime =
      this.dependencies.runtimeAdapterFactory.selectAdapter(usesSandboxRuntime);
    const autoApproveToolPermissions =
      await this.shouldAutoApproveToolPermissions({
        executionId: params.executionId,
        tenantId: params.tenantId,
        input: baseInput,
      });
    const nextSessionId = randomUUID();
    this.registerSubAgentToolsProvider({
      runtime,
      sessionId: nextSessionId,
      runtimeConfig: effectiveRuntimeConfig,
      executionId: params.executionId,
      tenantId: params.tenantId,
      step: params.step,
      currentDepth,
      currentAgentDefinitionId: this.config.agentDefinitionId,
      parentUsesSandboxRuntime: usesSandboxRuntime,
      sandboxBinding,
      emitEvents,
      visitedIds,
    });

    const subAgentEnvelope = params.subAgentInvocation
      ? this.createSubAgentEnvelope(params.subAgentInvocation, currentDepth)
      : undefined;
    let subAgentStream = subAgentEnvelope
      ? this.createSubAgentStream(subAgentEnvelope)
      : undefined;

    let session: AgentSession;
    try {
      session = await runtime.createSession({
        sessionId: nextSessionId,
        agentId: this.config.agentDefinitionId,
        mode: 'workflow',
        tenantId: params.tenantId,
        llmModelConfigId: effectiveRuntimeConfig.modelConfig?.modelId,
        systemPrompt,
        runtimeConfig: effectiveRuntimeConfig,
        ...(sandboxBinding ? { serverSandbox: sandboxBinding } : {}),
        context: {
          executionId: params.executionId,
          stepId: params.step.id,
          nodeId: params.step.nodeId,
          tenantId: params.tenantId,
          input: sanitizedInput,
          ...(autoApproveToolPermissions
            ? { autoApproveToolPermissions: true }
            : {}),
          ...(sandboxBinding ? { serverSandbox: sandboxBinding } : {}),
        },
      });
    } catch (error) {
      runtime.unregisterSessionToolProvider?.(nextSessionId);
      throw error;
    }

    let accumulatedContent = '';
    let decision: Record<string, unknown> | undefined;
    let stopReason: StopReason = 'end_turn';
    let chunkIndex = 0;
    let turnInput = promptBlocks;
    let toolCalls: ToolCallEvent[] = [];
    let segments: ConversationMessageSegmentRecord[] = [];
    let checkpointDirty = false;
    let lastCheckpointAt = 0;

    const flushProgressCheckpoint = async (
      round: number,
      force = false,
    ): Promise<void> => {
      const now = Date.now();
      if (
        !force &&
        (!checkpointDirty ||
          now - lastCheckpointAt < PROGRESS_CHECKPOINT_INTERVAL_MS)
      ) {
        return;
      }

      try {
        if (subAgentStream && subAgentEnvelope) {
          subAgentStream = this.syncSubAgentStreamRecord(
            subAgentStream,
            subAgentEnvelope,
          );
          await this.saveSubAgentProgressCheckpoint({
            tenantId: params.tenantId,
            step: params.step,
            stream: subAgentStream,
          });
        } else {
          await this.saveProgressCheckpoint({
            tenantId: params.tenantId,
            step: params.step,
            sessionId: session.id,
            partialContent: accumulatedContent,
            toolCalls,
            segments,
            round,
            chunkIndex,
            decision,
          });
        }
        checkpointDirty = false;
        lastCheckpointAt = now;
      } catch (error) {
        this.logger.warn(
          `Failed to persist workflow-agent checkpoint for step ${params.step.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        stopReason = 'end_turn';

        for await (const event of runtime.prompt(session.id, turnInput)) {
          if (subAgentEnvelope && subAgentStream) {
            const persistedEvent = normalizeSubAgentEventForPersistence(event);
            if (persistedEvent) {
              pushPersistedSubAgentEvent(subAgentStream, persistedEvent);
              checkpointDirty = true;
            }

            if (emitEvents) {
              this.dependencies.eventBridge.emitStepAgentEvent(
                params.tenantId,
                params.executionId,
                {
                  stepId: params.step.id,
                  executionType: 'workflow',
                  event,
                  subagent: subAgentEnvelope,
                },
              );
            }
          }

          if (event.type === 'message_chunk') {
            accumulatedContent += event.content;
            segments = appendTextConversationMessageSegment(
              segments,
              event.content,
            );
            if (!subAgentEnvelope && emitEvents) {
              this.dependencies.eventBridge.emitOutputChunk(
                params.tenantId,
                params.executionId,
                {
                  stepId: params.step.id,
                  chunk: event.content,
                  index: chunkIndex,
                  executionType: 'workflow',
                },
              );
            }
            chunkIndex += 1;
            checkpointDirty = true;
            await flushProgressCheckpoint(round, false);
            continue;
          }

          if (!subAgentEnvelope && emitEvents) {
            this.dependencies.eventBridge.emitStepAgentEvent(
              params.tenantId,
              params.executionId,
              {
                stepId: params.step.id,
                executionType: 'workflow',
                event,
              },
            );
          }

          const thinkingContent = this.extractThinkingEventContent(event);
          if (thinkingContent) {
            segments = appendThinkingConversationMessageSegment(
              segments,
              thinkingContent,
            );
            checkpointDirty = true;
          }

          if (event.type === 'tool_call') {
            toolCalls = this.mergeToolCall(toolCalls, event.call);
            segments = ensureToolCallConversationMessageSegment(
              segments,
              event.call.id,
            );
            checkpointDirty = true;

            if (!subAgentEnvelope && emitEvents) {
              this.emitToolCallStatus({
                tenantId: params.tenantId,
                executionId: params.executionId,
                step: params.step,
                toolCall: event.call,
              });
            }

            await flushProgressCheckpoint(round, true);
            continue;
          }

          if (event.type === 'decision') {
            decision = this.toDecisionPayload(event);
            checkpointDirty = true;
            await flushProgressCheckpoint(round, false);
            continue;
          }

          if (event.type === 'done') {
            stopReason = event.stopReason;
          }
        }

        await flushProgressCheckpoint(round + 1, true);

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

      if (subAgentStream) {
        completePersistedSubAgentStream(
          subAgentStream,
          stopReason === 'cancelled'
            ? SubAgentRunStatus.CANCELLED
            : SubAgentRunStatus.COMPLETED,
        );
        checkpointDirty = true;
        await flushProgressCheckpoint(MAX_TOOL_ROUNDS, true);
      }
    } catch (error) {
      if (subAgentStream) {
        completePersistedSubAgentStream(
          subAgentStream,
          SubAgentRunStatus.FAILED,
          error instanceof Error ? error.message : String(error),
        );
        checkpointDirty = true;
        await flushProgressCheckpoint(MAX_TOOL_ROUNDS, true);
      }
      throw error;
    }

    const result: WorkflowAgentExecutionResult = {
      content: accumulatedContent,
      'exec-out': { triggered: true },
      ...(stopReason !== 'end_turn' ? { stopReason } : {}),
      ...(decision ? { decision } : {}),
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

    const definitionSystemPrompt =
      this.dependencies.agentDefinitionService.resolveSystemPromptFromNodes?.(
        definition.nodes ?? [],
        definition.edges ?? [],
      ) ??
      definition.systemPrompt ??
      undefined;
    const snapshotSystemPrompt =
      this.dependencies.agentDefinitionService.resolveSystemPromptFromNodes?.(
        snapshot.nodes,
        snapshot.edges,
      ) ??
      snapshot.systemPrompt ??
      undefined;

    const normalizedDefinitionSandboxConfig =
      deriveAgentSandboxConfigFromCanvas(
        definition.nodes ?? [],
        definition.edges ?? [],
        definition.sandboxConfig,
      );
    const normalizedSnapshotSandboxConfig = deriveAgentSandboxConfigFromCanvas(
      snapshot.nodes,
      snapshot.edges,
      snapshot.sandboxConfig ?? null,
    );

    const runtimeConfig =
      this.dependencies.agentDefinitionService.buildRuntimeConfigFromNodes(
        snapshot.nodes,
        snapshot.edges,
        undefined,
        this.resolveAgentRuntimeMode(
          definition.runtimeMode,
          snapshot.runtimeMode,
        ),
      );
    runtimeConfig.runtimeMode ??= this.resolveAgentRuntimeMode(
      definition.runtimeMode,
      snapshot.runtimeMode,
    );
    const runtimeMode = runtimeConfig.runtimeMode ?? 'sandbox';
    runtimeConfig.runtimeMode = runtimeMode;

    runtimeConfig.sandboxConfig =
      runtimeMode === 'sandbox'
        ? resolveAgentRuntimeSandboxConfig(
            this.config.sandboxConfig ??
              mergeSandboxConfigCandidates(
                runtimeConfig.sandboxConfig ?? null,
                normalizedSnapshotSandboxConfig,
              ) ??
              normalizedDefinitionSandboxConfig ??
              definition.sandboxConfig,
          )
        : undefined;

    return {
      runtimeMode,
      runtimeConfig,
      systemPrompt: snapshotSystemPrompt ?? definitionSystemPrompt,
    };
  }

  private applySubAgentRefToCompiledDefinition(
    compiledDefinition: CompiledWorkflowAgentDefinition,
    subAgentRef?: AgentSubAgentRef,
  ): CompiledWorkflowAgentDefinition {
    if (!subAgentRef) {
      return compiledDefinition;
    }

    return {
      ...compiledDefinition,
      runtimeConfig: mergeRuntimeConfigWithSubAgentRef(
        compiledDefinition.runtimeConfig,
        subAgentRef,
      ),
      systemPrompt: resolveSubAgentSystemPrompt(
        compiledDefinition.systemPrompt,
        subAgentRef,
      ),
    };
  }

  private async resolveWorkflowExtensions(params: {
    tenantId: string;
    compiledDefinition: CompiledWorkflowAgentDefinition;
    input: Record<string, unknown>;
  }): Promise<
    CompiledWorkflowAgentDefinition & {
      sanitizedInput: Record<string, unknown>;
    }
  > {
    const runtimeConfig = this.mergeRuntimeConfigExtensions(
      params.compiledDefinition.runtimeConfig,
      params.input,
    );
    const baseSystemPrompt = appendOutputSchemaToSystemPrompt(
      this.extractUpstreamSystemPrompt(params.input) ??
        params.compiledDefinition.systemPrompt,
      runtimeConfig.outputSchema,
    );
    const systemPrompt = await this.resolveSkillAugmentedPrompt({
      tenantId: params.tenantId,
      baseSystemPrompt,
      runtimeConfig,
      input: params.input,
    });

    return {
      runtimeMode: params.compiledDefinition.runtimeMode,
      runtimeConfig,
      systemPrompt,
      sanitizedInput: this.sanitizePromptInput(params.input),
    };
  }

  private mergeRuntimeConfigExtensions(
    runtimeConfig: AgentRuntimeConfig,
    input: Record<string, unknown>,
  ): AgentRuntimeConfig {
    const merged = cloneAgentRuntimeConfig(runtimeConfig);

    const upstreamTools = this.extractUpstreamMcpToolBindings(input);
    if (upstreamTools.length > 0) {
      merged.tools = this.mergeToolBindings(merged.tools ?? [], upstreamTools);
    }

    const upstreamKnowledge = this.extractUpstreamKnowledgeBindings(input);
    if (upstreamKnowledge.length > 0) {
      merged.knowledgeBindings = this.mergeKnowledgeBindings(
        merged.knowledgeBindings ?? [],
        upstreamKnowledge,
      );
    }

    const upstreamOutputSchema = this.extractUpstreamOutputSchema(input);
    if (upstreamOutputSchema) {
      merged.outputSchema = upstreamOutputSchema;
    }

    return merged;
  }

  private mergeToolBindings(
    current: AgentToolBinding[],
    incoming: AgentToolBinding[],
  ): AgentToolBinding[] {
    const bindings = [...current];
    const seen = new Set(
      current.map((binding) => this.getToolBindingKey(binding)),
    );

    for (const binding of incoming) {
      const key = this.getToolBindingKey(binding);
      if (seen.has(key)) {
        continue;
      }

      bindings.push(binding);
      seen.add(key);
    }

    return bindings;
  }

  private mergeKnowledgeBindings(
    current: AgentKnowledgeBinding[],
    incoming: AgentKnowledgeBinding[],
  ): AgentKnowledgeBinding[] {
    const bindings = [...current];
    const seen = new Set(current.map((binding) => binding.knowledgeBaseId));

    for (const binding of incoming) {
      if (seen.has(binding.knowledgeBaseId)) {
        continue;
      }

      bindings.push(binding);
      seen.add(binding.knowledgeBaseId);
    }

    return bindings;
  }

  private async resolveSkillAugmentedPrompt(params: {
    tenantId: string;
    baseSystemPrompt?: string;
    runtimeConfig: AgentRuntimeConfig;
    input: Record<string, unknown>;
  }): Promise<string | undefined> {
    const builtInSkills = await this.resolveConfiguredSkills(
      params.tenantId,
      params.runtimeConfig.skillIds,
    );
    const upstreamSkills = this.extractUpstreamSkills(params.input);
    const mergedSkills = this.mergeSkillPayloads(builtInSkills, upstreamSkills);

    if (mergedSkills.length === 0) {
      return params.baseSystemPrompt;
    }

    if (this.dependencies.skillResolverService) {
      return this.dependencies.skillResolverService.buildSkillAugmentedPrompt(
        params.baseSystemPrompt ?? '',
        mergedSkills,
      );
    }

    const skillSections = mergedSkills
      .map((skill) => skill.content?.trim())
      .filter((content): content is string => Boolean(content));

    return [params.baseSystemPrompt, ...skillSections]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join('\n\n');
  }

  private async resolveConfiguredSkills(
    tenantId: string,
    skillIds?: string[],
  ): Promise<SkillPromptPayload[]> {
    if (
      !this.dependencies.skillResolverService ||
      !Array.isArray(skillIds) ||
      skillIds.length === 0
    ) {
      return [];
    }

    return this.dependencies.skillResolverService.resolveSkillsForAgent(
      tenantId,
      skillIds,
    );
  }

  private mergeSkillPayloads(
    current: SkillPromptPayload[],
    incoming: SkillPromptPayload[],
  ): SkillPromptPayload[] {
    const merged = [...current];
    const seen = new Set(
      current.map((skill) => this.getSkillPayloadKey(skill)),
    );

    for (const skill of incoming) {
      const key = this.getSkillPayloadKey(skill);
      if (seen.has(key)) {
        continue;
      }

      merged.push(skill);
      seen.add(key);
    }

    return merged;
  }

  private extractUpstreamSkills(
    input: Record<string, unknown>,
  ): SkillPromptPayload[] {
    const skills: SkillPromptPayload[] = [];

    this.visitInputValues(input, (record) => {
      if (!Array.isArray(record.skills)) {
        return;
      }

      for (const skill of record.skills) {
        const skillRecord = this.isRecord(skill) ? skill : null;
        if (
          !skillRecord ||
          typeof skillRecord.id !== 'string' ||
          typeof skillRecord.name !== 'string'
        ) {
          continue;
        }

        skills.push({
          id: skillRecord.id,
          name: skillRecord.name,
          description:
            typeof skillRecord.description === 'string'
              ? skillRecord.description
              : '',
          content:
            typeof skillRecord.content === 'string'
              ? skillRecord.content
              : null,
        });
      }
    });

    return skills;
  }

  private extractUpstreamMcpToolBindings(
    input: Record<string, unknown>,
  ): AgentToolBinding[] {
    const bindings: AgentToolBinding[] = [];

    this.visitInputValues(input, (record) => {
      if (record.type !== 'mcp-tool') {
        return;
      }

      for (const descriptor of this.extractMcpToolDescriptors(record)) {
        const binding: AgentMcpToolBinding = {
          toolType: 'mcp',
          toolId:
            descriptor.mcpToolDefinitionId ??
            `workflow-mcp:${descriptor.mcpServerConfigId}:${descriptor.toolName}`,
          name: descriptor.toolName,
          enabled: true,
          description: '通过 Workflow MCP 节点注入',
          ...(descriptor.mcpToolDefinitionId
            ? { mcpToolDefinitionId: descriptor.mcpToolDefinitionId }
            : {}),
          mcpServerConfigId: descriptor.mcpServerConfigId,
          toolName: descriptor.toolName,
          ...(descriptor.inputSchema
            ? { inputSchema: descriptor.inputSchema }
            : {}),
          ...(descriptor.portMapping
            ? { portMapping: descriptor.portMapping }
            : {}),
        };
        bindings.push(binding);
      }
    });

    return bindings;
  }

  private extractMcpToolDescriptors(record: Record<string, unknown>): Array<{
    mcpServerConfigId: string;
    toolName: string;
    mcpToolDefinitionId?: string;
    inputSchema?: Record<string, unknown>;
    portMapping?: Record<string, unknown>;
  }> {
    return extractMcpToolDescriptors(record);
  }

  private extractUpstreamKnowledgeBindings(
    input: Record<string, unknown>,
  ): AgentKnowledgeBinding[] {
    const bindings: AgentKnowledgeBinding[] = [];

    this.visitInputValues(input, (record) => {
      if (record.type !== 'knowledge-base') {
        return;
      }

      if (typeof record.knowledgeBaseId !== 'string') {
        return;
      }

      bindings.push({
        knowledgeBaseId: record.knowledgeBaseId,
        enabled: true,
        ...(typeof record.topK === 'number' ? { topK: record.topK } : {}),
        ...(typeof record.similarityThreshold === 'number'
          ? { similarityThreshold: record.similarityThreshold }
          : {}),
      });
    });

    return bindings;
  }

  private extractUpstreamSystemPrompt(
    input: Record<string, unknown>,
  ): string | undefined {
    const rawValue =
      input['system-prompt-in'] ??
      input.system_prompt_in ??
      input.systemPromptIn;

    return this.readTextValue(rawValue);
  }

  private extractUpstreamOutputSchema(
    input: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const rawValue =
      input['schema-in'] ??
      input.schema_in ??
      input.schemaIn ??
      input.outputSchema;

    return coerceAgentOutputSchema(rawValue);
  }

  private readTextValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }

    if (!this.isRecord(value)) {
      return undefined;
    }

    const candidates = [value.text, value.value, value.content];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }

    return undefined;
  }

  private sanitizePromptInput(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitizedEntries = Object.entries(input)
      .map(([key, value]) => {
        if (
          key === 'skills-in' ||
          key === 'skills' ||
          key === 'tools-in' ||
          key === 'sub-agents-in' ||
          key === 'system-prompt-in' ||
          key === 'schema-in' ||
          key === 'systemPromptIn' ||
          key === 'system_prompt_in' ||
          key === 'schemaIn' ||
          key === 'schema_in'
        ) {
          return null;
        }

        if (key === 'context-in' || key === 'context') {
          const sanitizedContext = this.stripExtensionValues(value);
          return sanitizedContext === undefined
            ? null
            : ([key, sanitizedContext] as const);
        }

        return [key, value] as const;
      })
      .filter((entry): entry is readonly [string, unknown] => entry !== null);

    return Object.fromEntries(sanitizedEntries);
  }

  private stripExtensionValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      const sanitizedValues = value
        .map((item) => this.stripExtensionValues(item))
        .filter((item) => item !== undefined);
      return sanitizedValues.length > 0 ? sanitizedValues : undefined;
    }

    if (!this.isRecord(value)) {
      return value;
    }

    if (this.isWorkflowExtensionRecord(value)) {
      return undefined;
    }

    const entries = Object.entries(value).flatMap(([key, nestedValue]) => {
      const sanitized = this.stripExtensionValues(nestedValue);
      return sanitized === undefined ? [] : [[key, sanitized] as const];
    });

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private isWorkflowExtensionRecord(record: Record<string, unknown>): boolean {
    return (
      record.type === 'knowledge-base' ||
      record.type === 'mcp-tool' ||
      record.type === 'memory' ||
      Array.isArray(record.skills)
    );
  }

  private visitInputValues(
    value: unknown,
    visitor: (record: Record<string, unknown>) => void,
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.visitInputValues(item, visitor);
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    visitor(value);

    for (const nestedValue of Object.values(value)) {
      this.visitInputValues(nestedValue, visitor);
    }
  }

  private getToolBindingKey(binding: AgentToolBinding): string {
    if (
      typeof binding.toolType === 'string' &&
      binding.toolType === 'mcp' &&
      typeof binding.mcpServerConfigId === 'string' &&
      typeof binding.toolName === 'string'
    ) {
      return `mcp:${binding.mcpServerConfigId}:${binding.toolName}`;
    }

    return `${binding.toolType ?? 'legacy'}:${binding.toolId}`;
  }

  private getSkillPayloadKey(skill: SkillPromptPayload): string {
    return `${skill.id}:${skill.name}`;
  }

  private readStringArray(...values: unknown[]): string[] {
    for (const value of values) {
      if (!Array.isArray(value)) {
        continue;
      }

      return value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      );
    }

    return [];
  }

  private resolveMcpPortMapping(
    record: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (this.isRecord(record.portMapping)) {
      return record.portMapping;
    }

    if (this.isRecord(record.portMappingMetadata)) {
      return record.portMappingMetadata;
    }

    return undefined;
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
    existingBinding?: ServerSandboxBinding;
    runtimeConfig: AgentRuntimeConfig;
  }): Promise<ServerSandboxBinding | undefined> {
    if (params.existingBinding?.executionId) {
      return params.existingBinding;
    }

    await this.dependencies.sandboxService.createSandboxSession({
      executionId: params.executionId,
      sandboxNodeId: params.nodeId,
      config: params.runtimeConfig.sandboxConfig!,
      tenantId: params.tenantId,
    });

    return {
      executionId: params.executionId,
      sandboxNodeId: params.nodeId,
    };
  }

  private registerSubAgentToolsProvider(params: {
    runtime: IAgentRuntime;
    sessionId: string;
    runtimeConfig: AgentRuntimeConfig;
    executionId: string;
    tenantId: string;
    step: ExecutionStep;
    currentDepth: number;
    currentAgentDefinitionId: string;
    parentUsesSandboxRuntime: boolean;
    sandboxBinding?: ServerSandboxBinding;
    emitEvents: boolean;
    visitedIds: Set<string>;
  }): void {
    if (
      !params.runtimeConfig.subAgents?.length ||
      !this.dependencies.subAgentToolsProvider ||
      !params.runtime.registerSessionToolProvider
    ) {
      return;
    }

    params.runtime.registerSessionToolProvider(
      params.sessionId,
      this.dependencies.subAgentToolsProvider.createSessionToolProvider(
        params.runtimeConfig.subAgents,
        {
          executionId: params.executionId,
          stepId: params.step.id,
          nodeId: params.step.nodeId,
          depth: params.currentDepth,
          tenantId: params.tenantId,
          parentUsesSandboxRuntime: params.parentUsesSandboxRuntime,
          visitedAgentIds: new Set([
            ...params.visitedIds,
            params.currentAgentDefinitionId,
          ]),
        },
        (subAgentParams) =>
          this.executeWorkflowSubAgent(subAgentParams, {
            executionId: params.executionId,
            tenantId: params.tenantId,
            step: params.step,
            sandboxBinding: params.sandboxBinding,
            parentUsesSandboxRuntime: params.parentUsesSandboxRuntime,
            emitEvents: params.emitEvents,
          }),
        {
          createEventProxy: () => undefined,
        },
      ),
    );
  }

  private async executeWorkflowSubAgent(
    params: ExecuteSubAgentParams,
    context: {
      executionId: string;
      tenantId: string;
      step: ExecutionStep;
      sandboxBinding?: ServerSandboxBinding;
      parentUsesSandboxRuntime: boolean;
      emitEvents: boolean;
    },
  ): Promise<SubAgentResult> {
    if (!params.versionSnapshot?.snapshot) {
      throw new Error(
        `Sub-agent "${params.subAgentRef.agentDefinitionId}" has no executable version snapshot`,
      );
    }

    const nestedAdapter = this.createNestedAdapter(params.agentDefinition.id);
    const result = await nestedAdapter.execute({
      executionId: context.executionId,
      step: context.step,
      input: {},
      tenantId: context.tenantId,
      agentVersionId: params.subAgentRef.agentVersionId,
      versionSnapshot: params.versionSnapshot.snapshot,
      currentDepth: params.depth,
      visitedIds: new Set([
        ...params.parentContext.visitedAgentIds,
        params.agentDefinition.id,
      ]),
      sandboxBinding: context.sandboxBinding,
      parentUsesSandboxRuntime: context.parentUsesSandboxRuntime,
      emitEvents: context.emitEvents,
      subAgentRef: params.subAgentRef,
      subAgentInvocation: {
        handle: params.handle,
        alias: params.alias,
        parentToolCallId: params.parentToolCallId,
        task: params.task,
        ...(params.context ? { context: params.context } : {}),
      },
    });

    return {
      content: result.content,
      stopReason: result.stopReason ?? 'end_turn',
      ...(result.decision ? { decision: result.decision } : {}),
    };
  }

  private async executeSubAgents(params: {
    executionId: string;
    step: ExecutionStep;
    tenantId: string;
    input: Record<string, unknown>;
    runtimeConfig: AgentRuntimeConfig;
    currentDepth: number;
    visitedIds: Set<string>;
    sandboxBinding?: ServerSandboxBinding;
    parentUsesSandboxRuntime: boolean;
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
      const subAgentKey = this.getSubAgentKey(subAgent);

      this.logger.log(
        `Workflow sub-agent start ${JSON.stringify({
          parentAgentDefinitionId: this.config.agentDefinitionId,
          subAgentKey,
          subAgentDefinitionId: subAgent.agentDefinitionId,
          subAgentVersionId: subAgent.agentVersionId ?? null,
          parentUsesSandboxRuntime: params.parentUsesSandboxRuntime,
          hasSandboxBinding: Boolean(params.sandboxBinding),
          sandboxNodeId: params.sandboxBinding?.sandboxNodeId ?? null,
          executionId: params.executionId,
          stepId: params.step.id,
        })}`,
      );

      let nestedResult: WorkflowAgentExecutionResult;
      try {
        nestedResult = await nestedAdapter.execute({
          executionId: params.executionId,
          step: params.step,
          input: params.input,
          tenantId: params.tenantId,
          agentVersionId: subAgent.agentVersionId,
          versionSnapshot: resolved.versionSnapshot.snapshot,
          currentDepth: params.currentDepth + 1,
          visitedIds: nextVisited,
          sandboxBinding: params.sandboxBinding,
          parentUsesSandboxRuntime: params.parentUsesSandboxRuntime,
          emitEvents: false,
          subAgentRef: subAgent,
        });
      } catch (error) {
        this.logger.error(
          `Workflow sub-agent failed ${JSON.stringify({
            parentAgentDefinitionId: this.config.agentDefinitionId,
            subAgentKey,
            subAgentDefinitionId: subAgent.agentDefinitionId,
            executionId: params.executionId,
            stepId: params.step.id,
            sandboxNodeId: params.sandboxBinding?.sandboxNodeId ?? null,
            error: error instanceof Error ? error.message : String(error),
          })}`,
        );
        throw error;
      }

      results[subAgentKey] = nestedResult;
    }

    return results;
  }

  private createNestedAdapter(agentDefinitionId: string): WorkflowAgentAdapter {
    return new WorkflowAgentAdapter(this.dependencies, { agentDefinitionId });
  }

  private createSubAgentEnvelope(
    params: NonNullable<WorkflowAgentExecutionParams['subAgentInvocation']>,
    depth: number,
  ): SubAgentEventEnvelope {
    return {
      handle: params.handle as SubAgentEventEnvelope['handle'],
      alias: params.alias,
      depth,
      parentToolCallId: params.parentToolCallId,
    };
  }

  private createSubAgentStream(
    envelope: SubAgentEventEnvelope,
  ): PersistedSubAgentStreamRecord {
    return createPersistedSubAgentStream(envelope);
  }

  private syncSubAgentStreamRecord(
    stream: PersistedSubAgentStreamRecord,
    envelope: SubAgentEventEnvelope,
  ): PersistedSubAgentStreamRecord {
    return {
      ...clonePersistedSubAgentStream(stream),
      alias: envelope.alias,
      depth: envelope.depth,
      parentToolCallId: envelope.parentToolCallId,
    };
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

  private extractThinkingEventContent(event: AgentEvent): string | undefined {
    switch (event.type) {
      case 'plan':
        return event.content || event.title;
      case 'decision':
        return event.rationale || event.suggestedContent;
      default:
        return undefined;
    }
  }

  private mergeToolCall(
    toolCalls: ToolCallEvent[],
    toolCall: ToolCallEvent,
  ): ToolCallEvent[] {
    const index = toolCalls.findIndex((current) => current.id === toolCall.id);
    if (index === -1) {
      return [...toolCalls, toolCall];
    }

    const current = toolCalls[index];
    const merged: ToolCallEvent = {
      ...current,
      ...toolCall,
      transitions: toolCall.transitions ?? current.transitions,
      args: toolCall.args ?? current.args,
      result: toolCall.result ?? current.result,
      error: toolCall.error ?? current.error,
      permissionRequest:
        toolCall.permissionRequest ?? current.permissionRequest,
    };

    return toolCalls.map((item, itemIndex) =>
      itemIndex === index ? merged : item,
    );
  }

  private async saveProgressCheckpoint(params: {
    tenantId: string;
    step: ExecutionStep;
    sessionId: string;
    partialContent: string;
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
    round: number;
    chunkIndex: number;
    decision?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const {
      tenantId,
      step,
      sessionId,
      partialContent,
      toolCalls,
      segments,
      round,
      chunkIndex,
      decision,
    } = params;

    return this.mergeCheckpointData(tenantId, step, {
      sessionId,
      partialContent,
      toolCalls,
      segments,
      round,
      chunkIndex,
      ...(decision ? { decision } : {}),
    });
  }

  private async saveSubAgentProgressCheckpoint(params: {
    tenantId: string;
    step: ExecutionStep;
    stream: PersistedSubAgentStreamRecord;
  }): Promise<Record<string, unknown>> {
    const existingStreams = this.readSubAgentStreams(params.step);
    existingStreams[params.stream.handle] = clonePersistedSubAgentStream(
      params.stream,
    );

    return this.mergeCheckpointData(params.tenantId, params.step, {
      subAgentStreams: existingStreams,
    });
  }

  private async mergeCheckpointData(
    _tenantId: string,
    step: ExecutionStep,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const checkpointData = {
      ...this.getCheckpointData(step),
      ...patch,
    };

    await this.tenantDb
      .update(executionSteps)
      .set({ checkpointData })
      .where(eq(executionSteps.id, step.id));

    step.checkpointData = checkpointData;
    return checkpointData;
  }

  private getCheckpointData(step: ExecutionStep): Record<string, unknown> {
    return step.checkpointData ?? {};
  }

  private readSubAgentStreams(
    step: ExecutionStep,
  ): Record<string, PersistedSubAgentStreamRecord> {
    const rawStreams = this.getCheckpointData(step).subAgentStreams;
    if (!this.isRecord(rawStreams)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(rawStreams).flatMap(([handle, stream]) =>
        this.isPersistedSubAgentStreamRecord(stream)
          ? [[handle, clonePersistedSubAgentStream(stream)]]
          : [],
      ),
    );
  }

  private emitToolCallStatus(params: {
    tenantId: string;
    executionId: string;
    step: ExecutionStep;
    toolCall: ToolCallEvent;
  }): void {
    const { tenantId, executionId, step, toolCall } = params;

    this.dependencies.eventBridge.emitToolCallStatus(tenantId, executionId, {
      stepId: step.id,
      nodeId: step.nodeId,
      executionType: 'workflow',
      toolCallId: toolCall.id,
      tool: toolCall.tool,
      status: toolCall.status,
      ...(toolCall.args ? { args: toolCall.args } : {}),
      ...(toolCall.result !== undefined ? { result: toolCall.result } : {}),
      ...(toolCall.error ? { error: toolCall.error } : {}),
      ...(toolCall.permissionRequest
        ? { permissionRequest: toolCall.permissionRequest }
        : {}),
      ...(toolCall.transitions
        ? { transitions: [...toolCall.transitions] }
        : {}),
    });

    if (
      toolCall.status === 'awaiting_permission' &&
      toolCall.permissionRequest
    ) {
      this.dependencies.eventBridge.emitToolPermissionRequired(
        tenantId,
        executionId,
        {
          stepId: step.id,
          nodeId: step.nodeId,
          executionType: 'workflow',
          toolCallId: toolCall.id,
          tool: toolCall.tool,
          args: toolCall.args,
          requestedAt:
            toolCall.transitions?.at(-1)?.timestamp ?? new Date().toISOString(),
          permissionRequest: toolCall.permissionRequest,
        },
      );
    }
  }

  private buildContentBlocks(input: Record<string, unknown>): ContentBlock[] {
    return buildAgentPromptContentBlocks({ input });
  }

  private buildSubAgentPrompt(task: string, context?: string): string {
    if (!context?.trim()) {
      return task.trim();
    }

    return ['任务：', task.trim(), '', '额外上下文：', context.trim()].join(
      '\n',
    );
  }

  private async shouldAutoApproveToolPermissions(params: {
    executionId: string;
    tenantId: string;
    input: Record<string, unknown>;
  }): Promise<boolean> {
    const [execution] = await this.tenantDb
      .select({
        triggerType: workflowExecutions.triggerType,
      })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.id, params.executionId),
          eq(workflowExecutions.tenantId, params.tenantId),
        ),
      );

    if (execution) {
      return execution.triggerType === 'system';
    }

    const execInput = this.isRecord(params.input['exec-in'])
      ? params.input['exec-in']
      : this.isRecord(params.input.exec_in)
        ? params.input.exec_in
        : null;

    if (!execInput) {
      return false;
    }

    return (
      execInput.triggerType === 'system' || execInput.trigger_type === 'system'
    );
  }

  private resolveAgentRuntimeMode(
    definitionRuntimeMode: unknown,
    snapshotRuntimeMode: unknown,
  ): AgentRuntimeMode {
    if (
      snapshotRuntimeMode === 'sandbox' ||
      snapshotRuntimeMode === 'no_sandbox'
    ) {
      return snapshotRuntimeMode;
    }

    return definitionRuntimeMode === 'no_sandbox' ? 'no_sandbox' : 'sandbox';
  }

  private buildReadOnlyNativeToolPolicy() {
    return {
      readEnabled: true,
      writeEnabled: false,
      editEnabled: false,
      terminalEnabled: false,
    } as const;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isPersistedSubAgentStreamRecord(
    value: unknown,
  ): value is PersistedSubAgentStreamRecord {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value.handle === 'string' &&
      typeof value.alias === 'string' &&
      typeof value.parentToolCallId === 'string' &&
      typeof value.depth === 'number' &&
      Array.isArray(value.events) &&
      typeof value.startedAt === 'number'
    );
  }
}
