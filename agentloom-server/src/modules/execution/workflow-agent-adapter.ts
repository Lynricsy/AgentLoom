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
import type { ServerSandboxBinding } from '../agent/types/agent-session.types';
import type {
  DecisionEvent,
  StopReason,
} from '../agent/types/agent-event.types';
import type { ContentBlock } from '../agent/types/content-block.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type {
  AgentKnowledgeBinding,
  AgentRuntimeConfig,
  AgentToolBinding,
  AgentSubAgentRef,
} from '../agent-definition/agent-runtime-config.interface';
import {
  resolveSubAgent,
  MAX_SUB_AGENT_DEPTH,
} from './node-handlers/sub-agent.handler';
import { buildAgentPromptContentBlocks } from './agent-prompt-content.builder';
import { EventBridgeService } from './services/event-bridge.service';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import type { SkillPromptPayload } from '../skill/skill.types';

const MAX_TOOL_ROUNDS = 10;

interface WorkflowAgentAdapterDependencies {
  readonly db: DrizzleDB;
  readonly agentRuntime: IAgentRuntime;
  readonly runtimeAdapterFactory: RuntimeAdapterFactory;
  readonly agentDefinitionService: AgentDefinitionService;
  readonly sandboxService: SandboxService;
  readonly eventBridge: EventBridgeService;
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
    const {
      runtimeConfig: runtimeConfigWithExtensions,
      systemPrompt,
      sanitizedInput,
    } = await this.resolveWorkflowExtensions({
      tenantId: params.tenantId,
      compiledDefinition,
      input: params.input,
    });

    const sandboxBinding = await this.ensureSandboxBinding({
      executionId: params.executionId,
      nodeId: params.step.nodeId,
      tenantId: params.tenantId,
      existingBinding: params.sandboxBinding,
      runtimeConfig: runtimeConfigWithExtensions,
    });

    const subAgentResults = await this.executeSubAgents({
      executionId: params.executionId,
      step: params.step,
      tenantId: params.tenantId,
      input: sanitizedInput,
      runtimeConfig: runtimeConfigWithExtensions,
      currentDepth,
      visitedIds,
      sandboxBinding,
    });

    const promptBlocks = this.buildContentBlocks(
      sanitizedInput,
      subAgentResults,
    );
    void this.dependencies.agentRuntime;
    const runtime = this.dependencies.runtimeAdapterFactory.selectAdapter(true);

    const session = await runtime.createSession({
      agentId: this.config.agentDefinitionId,
      mode: 'workflow',
      tenantId: params.tenantId,
      llmModelConfigId: runtimeConfigWithExtensions.modelConfig?.modelId,
      systemPrompt,
      runtimeConfig: runtimeConfigWithExtensions,
      ...(sandboxBinding ? { serverSandbox: sandboxBinding } : {}),
      context: {
        executionId: params.executionId,
        stepId: params.step.id,
        nodeId: params.step.nodeId,
        tenantId: params.tenantId,
        input: sanitizedInput,
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
    const systemPrompt = await this.resolveSkillAugmentedPrompt({
      tenantId: params.tenantId,
      baseSystemPrompt: params.compiledDefinition.systemPrompt,
      runtimeConfig,
      input: params.input,
    });

    return {
      runtimeConfig,
      systemPrompt,
      sanitizedInput: this.sanitizePromptInput(params.input),
    };
  }

  private mergeRuntimeConfigExtensions(
    runtimeConfig: AgentRuntimeConfig,
    input: Record<string, unknown>,
  ): AgentRuntimeConfig {
    const merged: AgentRuntimeConfig = {
      ...runtimeConfig,
      ...(runtimeConfig.tools ? { tools: [...runtimeConfig.tools] } : {}),
      ...(runtimeConfig.knowledgeBindings
        ? { knowledgeBindings: [...runtimeConfig.knowledgeBindings] }
        : {}),
      ...(runtimeConfig.subAgents
        ? { subAgents: [...runtimeConfig.subAgents] }
        : {}),
      ...(runtimeConfig.inputPreprocessors
        ? { inputPreprocessors: [...runtimeConfig.inputPreprocessors] }
        : {}),
      ...(runtimeConfig.memoryInstanceIds
        ? { memoryInstanceIds: [...runtimeConfig.memoryInstanceIds] }
        : {}),
      ...(runtimeConfig.skillIds
        ? { skillIds: [...runtimeConfig.skillIds] }
        : {}),
    };

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
        bindings.push({
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
        });
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
    const topLevelPortMapping = this.resolveMcpPortMapping(record);
    const topLevelInputSchema = this.isRecord(record.inputSchema)
      ? record.inputSchema
      : undefined;
    const topLevelConfigId =
      typeof record.mcpServerConfigId === 'string'
        ? record.mcpServerConfigId
        : undefined;
    const enabledToolIds = this.readStringArray(
      record.enabledToolIds,
      record.enabled_tool_ids,
    );
    const tools = Array.isArray(record.tools) ? record.tools : [];
    const descriptors: Array<{
      mcpServerConfigId: string;
      toolName: string;
      mcpToolDefinitionId?: string;
      inputSchema?: Record<string, unknown>;
      portMapping?: Record<string, unknown>;
    }> = [];

    for (const tool of tools) {
      const toolRecord = this.isRecord(tool) ? tool : null;
      if (!toolRecord) {
        continue;
      }
      const toolId =
        typeof toolRecord.id === 'string'
          ? toolRecord.id
          : typeof toolRecord.mcpToolDefinitionId === 'string'
            ? toolRecord.mcpToolDefinitionId
            : undefined;

      if (
        enabledToolIds.length > 0 &&
        (!toolId || !enabledToolIds.includes(toolId))
      ) {
        continue;
      }

      const mcpServerConfigId =
        typeof toolRecord.mcpServerConfigId === 'string'
          ? toolRecord.mcpServerConfigId
          : topLevelConfigId;
      const toolName =
        typeof toolRecord.toolName === 'string'
          ? toolRecord.toolName
          : typeof toolRecord.name === 'string'
            ? toolRecord.name
            : typeof toolRecord.title === 'string'
              ? toolRecord.title
              : undefined;

      if (!mcpServerConfigId || !toolName) {
        continue;
      }

      descriptors.push({
        mcpServerConfigId,
        toolName,
        ...(toolId ? { mcpToolDefinitionId: toolId } : {}),
        ...(this.isRecord(toolRecord.inputSchema)
          ? { inputSchema: toolRecord.inputSchema }
          : topLevelInputSchema
            ? { inputSchema: topLevelInputSchema }
            : {}),
        ...(this.resolveMcpPortMapping(toolRecord)
          ? { portMapping: this.resolveMcpPortMapping(toolRecord) }
          : topLevelPortMapping
            ? { portMapping: topLevelPortMapping }
            : {}),
      });
    }

    if (descriptors.length > 0) {
      return descriptors;
    }

    if (
      typeof topLevelConfigId === 'string' &&
      typeof record.toolName === 'string'
    ) {
      return [
        {
          mcpServerConfigId: topLevelConfigId,
          toolName: record.toolName,
          ...(typeof record.mcpToolDefinitionId === 'string'
            ? { mcpToolDefinitionId: record.mcpToolDefinitionId }
            : {}),
          ...(topLevelInputSchema ? { inputSchema: topLevelInputSchema } : {}),
          ...(topLevelPortMapping ? { portMapping: topLevelPortMapping } : {}),
        },
      ];
    }

    return [];
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

  private sanitizePromptInput(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitizedEntries = Object.entries(input)
      .map(([key, value]) => {
        if (key === 'skills-in' || key === 'skills' || key === 'tools-in' || key === 'sub-agents-in') {
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

  private async executeSubAgents(params: {
    executionId: string;
    step: ExecutionStep;
    tenantId: string;
    input: Record<string, unknown>;
    runtimeConfig: AgentRuntimeConfig;
    currentDepth: number;
    visitedIds: Set<string>;
    sandboxBinding?: ServerSandboxBinding;
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
    return buildAgentPromptContentBlocks({
      input,
      ...(Object.keys(subAgentResults).length > 0 ? { subAgentResults } : {}),
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
