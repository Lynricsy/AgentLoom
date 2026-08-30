import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
  type AgentRuntimeMode,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import { isRecoverableAgentRuntimeErrorMessage } from '../agent/agent-runtime-error.utils';
import { memorySessions, type MemorySession } from '../../database/schema';
import { AgentAdapterFactory } from '../agent/agent-adapter.factory';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type {
  DecisionEvent,
  StopReason,
} from '../agent/types/agent-event.types';
import type { AgentSession } from '../agent/types/agent-session.types';
import type {
  ContentBlock,
  TextContentBlock,
} from '../agent/types/content-block.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { AgentSandboxNotConnectedException } from '../agent-definition/agent-definition.exceptions';
import {
  appendOutputSchemaToSystemPrompt,
  mergeRuntimeConfigWithSubAgentRef,
  resolveSubAgentSystemPrompt,
} from '../agent-definition/agent-runtime-config.utils';
import {
  deriveAgentSandboxConfigFromCanvas,
  mergeSandboxConfigCandidates,
} from '../agent-definition/agent-sandbox-config.utils';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import type { PreparationPhase } from '../execution/types/execution-event.types';
import { InputPreprocessorHandlerImpl } from '../execution/node-handlers/input-preprocessor.handler';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SelfEvolutionToolsProvider } from '../self-evolution/self-evolution-tools.provider';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import {
  MemoryResourceProvider,
  type MemoryResourceInstance,
} from '../agent-memory/memory-resource.provider';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { ConversationTitleService } from '../agent-conversation/conversation-title.service';
import { AgentTurnEventAccumulator } from '../agent/shared/agent-turn-event-accumulator';
import { bindMemoryToolSession } from '../agent/shared/memory-tool-session-binder';
import {
  buildConversationPromptBlocks,
  formatLatestPendingMessages,
  type HistoryConversationPromptMessage,
  type PendingConversationPromptMessage,
} from './conversation-prompt-blocks';
import { WorkspaceIntegrationService } from './workspace-integration.service';
import {
  readConversationAttachmentMetadataList,
  resolveConversationMessageContentType,
  withConversationAttachmentSandboxPaths,
} from '../agent-conversation/conversation-attachment';
import {
  type ExecuteSubAgentParams,
  type SubAgentCompletionNotice,
  type SubAgentHandle,
  type SubAgentResult,
  SubAgentRunStatus,
  SubAgentToolsProvider,
} from './subagent';
import {
  AGENT_CONVERSATION_EXECUTION_JOB,
  AGENT_CONVERSATION_EXECUTION_QUEUE,
  AGENT_CONVERSATION_IDLE_WAIT_MS,
  AgentExecutionService,
  type AgentConversationExecutionJobData,
} from './agent-execution.service';
import {
  buildExecutionMetadataForPublishedVersionRefresh,
  type ConversationExecutionMetadata,
  extractStringArray,
  isRecord,
  mergeExecutionMetadata,
  normalizeOptionalString,
  readExecutionMetadata,
  readStringValue,
  shouldRefreshConversationRuntimeForPublishedVersion,
  writeExecutionMetadata,
} from './conversation-execution-metadata';
import {
  buildMemoryBootPrompt,
  prependSystemPrompt,
} from './conversation-memory-prompt';
import {
  resolveConfiguredSkillIds as resolveConfiguredSkillIdsForConversation,
  resolveSkillAugmentedPrompt,
  resolveSkillPayloadsForGraph,
} from './conversation-skill-resolution';
import { buildPiConfigInput } from './pi-config-input.builder';
import {
  applyConversationInputPreprocessors,
  estimateConversationTokenCount,
  normalizeConversationRoutingStrategy,
} from './conversation-runtime-input';
import {
  buildConversationTurnResult,
  buildPromptBlocks as buildConversationWorkerPromptBlocks,
  type ConversationTurnResult,
  turnResultHasPersistableOutput,
} from './conversation-turn-values';

type ConversationExecutionContext = {
  conversation: {
    id: string;
    agentDefinitionId: string;
    tenantId: string;
    status: 'active' | 'paused' | 'ended' | 'failed';
    metadata: Record<string, unknown>;
  };
  runtimeConfig: AgentRuntimeConfig;
  systemPrompt?: string;
  canvasNodes: AgentVersionSnapshot['nodes'];
  canvasEdges: AgentVersionSnapshot['edges'];
  hasSandbox: boolean;
  memoryInstanceIds: string[];
  publishedVersionId?: string;
  executionMetadata: ConversationExecutionMetadata;
};

type PendingMessage = {
  id: string;
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type ConversationHistoryMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  contentType: string;
  toolCalls: Record<string, unknown>[] | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type RuntimeSessionContext = {
  runtime: IAgentRuntime;
  session: AgentSession;
  memorySessionIds: string[];
  restoredExistingSession: boolean;
  sandboxReused: boolean;
  /** The last preparation phase reached before this context was returned. */
  lastPhase: PreparationPhase;
};

type SubAgentExecutionTracker = {
  abortControllers: Map<SubAgentHandle, AbortController>;
};

const DEFAULT_MEMORY_BOOT_URIS = [
  'system://boot',
  'system://index',
  'system://glossary',
];

import { ConversationTurnFailedError } from './conversation-turn-failed.error';
import { AgentExecutionWorkerPersistenceService } from './agent-execution-worker-persistence.service';
import { AgentExecutionWorkerRuntimeService } from './agent-execution-worker-runtime.service';

@Injectable()
@Processor(AGENT_CONVERSATION_EXECUTION_QUEUE)
export class AgentExecutionWorker extends WorkerHost {
  private readonly delegatedOverrides = new Map<string, Function>();

  public get persistConversationTurn(): AgentExecutionWorkerPersistenceService['persistConversationTurn'] {
    return (
      (this.delegatedOverrides.get('persistConversationTurn') as
        | AgentExecutionWorkerPersistenceService['persistConversationTurn']
        | undefined) ??
      this.persistenceService.persistConversationTurn.bind(
        this.persistenceService,
      )
    );
  }

  public set persistConversationTurn(
    value: AgentExecutionWorkerPersistenceService['persistConversationTurn'],
  ) {
    this.delegatedOverrides.set('persistConversationTurn', value);
    this.persistenceService.persistConversationTurn = value;
  }

  public get updateExecutionMetadata(): AgentExecutionWorkerPersistenceService['updateExecutionMetadata'] {
    return (
      (this.delegatedOverrides.get('updateExecutionMetadata') as
        | AgentExecutionWorkerPersistenceService['updateExecutionMetadata']
        | undefined) ??
      this.persistenceService.updateExecutionMetadata.bind(
        this.persistenceService,
      )
    );
  }

  public set updateExecutionMetadata(
    value: AgentExecutionWorkerPersistenceService['updateExecutionMetadata'],
  ) {
    this.delegatedOverrides.set('updateExecutionMetadata', value);
    this.persistenceService.updateExecutionMetadata = value;
  }

  public get safeUpdateExecutionMetadata(): AgentExecutionWorkerPersistenceService['safeUpdateExecutionMetadata'] {
    return (
      (this.delegatedOverrides.get('safeUpdateExecutionMetadata') as
        | AgentExecutionWorkerPersistenceService['safeUpdateExecutionMetadata']
        | undefined) ??
      this.persistenceService.safeUpdateExecutionMetadata.bind(
        this.persistenceService,
      )
    );
  }

  public set safeUpdateExecutionMetadata(
    value: AgentExecutionWorkerPersistenceService['safeUpdateExecutionMetadata'],
  ) {
    this.delegatedOverrides.set('safeUpdateExecutionMetadata', value);
    this.persistenceService.safeUpdateExecutionMetadata = value;
  }

  public get loadConversationMetadata(): AgentExecutionWorkerPersistenceService['loadConversationMetadata'] {
    return (
      (this.delegatedOverrides.get('loadConversationMetadata') as
        | AgentExecutionWorkerPersistenceService['loadConversationMetadata']
        | undefined) ??
      this.persistenceService.loadConversationMetadata.bind(
        this.persistenceService,
      )
    );
  }

  public set loadConversationMetadata(
    value: AgentExecutionWorkerPersistenceService['loadConversationMetadata'],
  ) {
    this.delegatedOverrides.set('loadConversationMetadata', value);
    this.persistenceService.loadConversationMetadata = value;
  }

  public get materializePendingMessagesForRuntime(): AgentExecutionWorkerPersistenceService['materializePendingMessagesForRuntime'] {
    return (
      (this.delegatedOverrides.get('materializePendingMessagesForRuntime') as
        | AgentExecutionWorkerPersistenceService['materializePendingMessagesForRuntime']
        | undefined) ??
      this.persistenceService.materializePendingMessagesForRuntime.bind(
        this.persistenceService,
      )
    );
  }

  public set materializePendingMessagesForRuntime(
    value: AgentExecutionWorkerPersistenceService['materializePendingMessagesForRuntime'],
  ) {
    this.delegatedOverrides.set('materializePendingMessagesForRuntime', value);
    this.persistenceService.materializePendingMessagesForRuntime = value;
  }

  public get buildPromptBlocks(): AgentExecutionWorkerPersistenceService['buildPromptBlocks'] {
    return (
      (this.delegatedOverrides.get('buildPromptBlocks') as
        | AgentExecutionWorkerPersistenceService['buildPromptBlocks']
        | undefined) ??
      this.persistenceService.buildPromptBlocks.bind(this.persistenceService)
    );
  }

  public set buildPromptBlocks(
    value: AgentExecutionWorkerPersistenceService['buildPromptBlocks'],
  ) {
    this.delegatedOverrides.set('buildPromptBlocks', value);
    this.persistenceService.buildPromptBlocks = value;
  }

  public get resolveDefaultMemoryInstanceIds(): AgentExecutionWorkerPersistenceService['resolveDefaultMemoryInstanceIds'] {
    return (
      (this.delegatedOverrides.get('resolveDefaultMemoryInstanceIds') as
        | AgentExecutionWorkerPersistenceService['resolveDefaultMemoryInstanceIds']
        | undefined) ??
      this.persistenceService.resolveDefaultMemoryInstanceIds.bind(
        this.persistenceService,
      )
    );
  }

  public set resolveDefaultMemoryInstanceIds(
    value: AgentExecutionWorkerPersistenceService['resolveDefaultMemoryInstanceIds'],
  ) {
    this.delegatedOverrides.set('resolveDefaultMemoryInstanceIds', value);
    this.persistenceService.resolveDefaultMemoryInstanceIds = value;
  }

  public get ensureConversationMemorySessions(): AgentExecutionWorkerPersistenceService['ensureConversationMemorySessions'] {
    return (
      (this.delegatedOverrides.get('ensureConversationMemorySessions') as
        | AgentExecutionWorkerPersistenceService['ensureConversationMemorySessions']
        | undefined) ??
      this.persistenceService.ensureConversationMemorySessions.bind(
        this.persistenceService,
      )
    );
  }

  public set ensureConversationMemorySessions(
    value: AgentExecutionWorkerPersistenceService['ensureConversationMemorySessions'],
  ) {
    this.delegatedOverrides.set('ensureConversationMemorySessions', value);
    this.persistenceService.ensureConversationMemorySessions = value;
  }

  public get ensureAttachedMemorySessions(): AgentExecutionWorkerPersistenceService['ensureAttachedMemorySessions'] {
    return (
      (this.delegatedOverrides.get('ensureAttachedMemorySessions') as
        | AgentExecutionWorkerPersistenceService['ensureAttachedMemorySessions']
        | undefined) ??
      this.persistenceService.ensureAttachedMemorySessions.bind(
        this.persistenceService,
      )
    );
  }

  public set ensureAttachedMemorySessions(
    value: AgentExecutionWorkerPersistenceService['ensureAttachedMemorySessions'],
  ) {
    this.delegatedOverrides.set('ensureAttachedMemorySessions', value);
    this.persistenceService.ensureAttachedMemorySessions = value;
  }

  public get resolveConversationSystemPrompt(): AgentExecutionWorkerPersistenceService['resolveConversationSystemPrompt'] {
    return (
      (this.delegatedOverrides.get('resolveConversationSystemPrompt') as
        | AgentExecutionWorkerPersistenceService['resolveConversationSystemPrompt']
        | undefined) ??
      this.persistenceService.resolveConversationSystemPrompt.bind(
        this.persistenceService,
      )
    );
  }

  public set resolveConversationSystemPrompt(
    value: AgentExecutionWorkerPersistenceService['resolveConversationSystemPrompt'],
  ) {
    this.delegatedOverrides.set('resolveConversationSystemPrompt', value);
    this.persistenceService.resolveConversationSystemPrompt = value;
  }

  public get resolveConversationSkillPrompt(): AgentExecutionWorkerPersistenceService['resolveConversationSkillPrompt'] {
    return (
      (this.delegatedOverrides.get('resolveConversationSkillPrompt') as
        | AgentExecutionWorkerPersistenceService['resolveConversationSkillPrompt']
        | undefined) ??
      this.persistenceService.resolveConversationSkillPrompt.bind(
        this.persistenceService,
      )
    );
  }

  public set resolveConversationSkillPrompt(
    value: AgentExecutionWorkerPersistenceService['resolveConversationSkillPrompt'],
  ) {
    this.delegatedOverrides.set('resolveConversationSkillPrompt', value);
    this.persistenceService.resolveConversationSkillPrompt = value;
  }

  public get resolveSkillPayloads(): AgentExecutionWorkerPersistenceService['resolveSkillPayloads'] {
    return (
      (this.delegatedOverrides.get('resolveSkillPayloads') as
        | AgentExecutionWorkerPersistenceService['resolveSkillPayloads']
        | undefined) ??
      this.persistenceService.resolveSkillPayloads.bind(this.persistenceService)
    );
  }

  public set resolveSkillPayloads(
    value: AgentExecutionWorkerPersistenceService['resolveSkillPayloads'],
  ) {
    this.delegatedOverrides.set('resolveSkillPayloads', value);
    this.persistenceService.resolveSkillPayloads = value;
  }

  public get resolveConfiguredSkillIds(): AgentExecutionWorkerPersistenceService['resolveConfiguredSkillIds'] {
    return (
      (this.delegatedOverrides.get('resolveConfiguredSkillIds') as
        | AgentExecutionWorkerPersistenceService['resolveConfiguredSkillIds']
        | undefined) ??
      this.persistenceService.resolveConfiguredSkillIds.bind(
        this.persistenceService,
      )
    );
  }

  public set resolveConfiguredSkillIds(
    value: AgentExecutionWorkerPersistenceService['resolveConfiguredSkillIds'],
  ) {
    this.delegatedOverrides.set('resolveConfiguredSkillIds', value);
    this.persistenceService.resolveConfiguredSkillIds = value;
  }

  public get resolveAgentRuntimeMode(): AgentExecutionWorkerPersistenceService['resolveAgentRuntimeMode'] {
    return (
      (this.delegatedOverrides.get('resolveAgentRuntimeMode') as
        | AgentExecutionWorkerPersistenceService['resolveAgentRuntimeMode']
        | undefined) ??
      this.persistenceService.resolveAgentRuntimeMode.bind(
        this.persistenceService,
      )
    );
  }

  public set resolveAgentRuntimeMode(
    value: AgentExecutionWorkerPersistenceService['resolveAgentRuntimeMode'],
  ) {
    this.delegatedOverrides.set('resolveAgentRuntimeMode', value);
    this.persistenceService.resolveAgentRuntimeMode = value;
  }

  public get buildReadOnlyNativeToolPolicy(): AgentExecutionWorkerPersistenceService['buildReadOnlyNativeToolPolicy'] {
    return (
      (this.delegatedOverrides.get('buildReadOnlyNativeToolPolicy') as
        | AgentExecutionWorkerPersistenceService['buildReadOnlyNativeToolPolicy']
        | undefined) ??
      this.persistenceService.buildReadOnlyNativeToolPolicy.bind(
        this.persistenceService,
      )
    );
  }

  public set buildReadOnlyNativeToolPolicy(
    value: AgentExecutionWorkerPersistenceService['buildReadOnlyNativeToolPolicy'],
  ) {
    this.delegatedOverrides.set('buildReadOnlyNativeToolPolicy', value);
    this.persistenceService.buildReadOnlyNativeToolPolicy = value;
  }

  public get registerSubAgentToolsProvider(): AgentExecutionWorkerPersistenceService['registerSubAgentToolsProvider'] {
    return (
      (this.delegatedOverrides.get('registerSubAgentToolsProvider') as
        | AgentExecutionWorkerPersistenceService['registerSubAgentToolsProvider']
        | undefined) ??
      this.persistenceService.registerSubAgentToolsProvider.bind(
        this.persistenceService,
      )
    );
  }

  public set registerSubAgentToolsProvider(
    value: AgentExecutionWorkerPersistenceService['registerSubAgentToolsProvider'],
  ) {
    this.delegatedOverrides.set('registerSubAgentToolsProvider', value);
    this.persistenceService.registerSubAgentToolsProvider = value;
  }

  public get registerSelfEvolutionToolsProvider(): AgentExecutionWorkerPersistenceService['registerSelfEvolutionToolsProvider'] {
    return (
      (this.delegatedOverrides.get('registerSelfEvolutionToolsProvider') as
        | AgentExecutionWorkerPersistenceService['registerSelfEvolutionToolsProvider']
        | undefined) ??
      this.persistenceService.registerSelfEvolutionToolsProvider.bind(
        this.persistenceService,
      )
    );
  }

  public set registerSelfEvolutionToolsProvider(
    value: AgentExecutionWorkerPersistenceService['registerSelfEvolutionToolsProvider'],
  ) {
    this.delegatedOverrides.set('registerSelfEvolutionToolsProvider', value);
    this.persistenceService.registerSelfEvolutionToolsProvider = value;
  }

  public get executeSubAgent(): AgentExecutionWorkerPersistenceService['executeSubAgent'] {
    return (
      (this.delegatedOverrides.get('executeSubAgent') as
        | AgentExecutionWorkerPersistenceService['executeSubAgent']
        | undefined) ??
      this.persistenceService.executeSubAgent.bind(this.persistenceService)
    );
  }

  public set executeSubAgent(
    value: AgentExecutionWorkerPersistenceService['executeSubAgent'],
  ) {
    this.delegatedOverrides.set('executeSubAgent', value);
    this.persistenceService.executeSubAgent = value;
  }

  public get runSubAgentPrompt(): AgentExecutionWorkerPersistenceService['runSubAgentPrompt'] {
    return (
      (this.delegatedOverrides.get('runSubAgentPrompt') as
        | AgentExecutionWorkerPersistenceService['runSubAgentPrompt']
        | undefined) ??
      this.persistenceService.runSubAgentPrompt.bind(this.persistenceService)
    );
  }

  public set runSubAgentPrompt(
    value: AgentExecutionWorkerPersistenceService['runSubAgentPrompt'],
  ) {
    this.delegatedOverrides.set('runSubAgentPrompt', value);
    this.persistenceService.runSubAgentPrompt = value;
  }

  public get buildSubAgentPrompt(): AgentExecutionWorkerPersistenceService['buildSubAgentPrompt'] {
    return (
      (this.delegatedOverrides.get('buildSubAgentPrompt') as
        | AgentExecutionWorkerPersistenceService['buildSubAgentPrompt']
        | undefined) ??
      this.persistenceService.buildSubAgentPrompt.bind(this.persistenceService)
    );
  }

  public set buildSubAgentPrompt(
    value: AgentExecutionWorkerPersistenceService['buildSubAgentPrompt'],
  ) {
    this.delegatedOverrides.set('buildSubAgentPrompt', value);
    this.persistenceService.buildSubAgentPrompt = value;
  }

  public get abortTrackedSubAgents(): AgentExecutionWorkerPersistenceService['abortTrackedSubAgents'] {
    return (
      (this.delegatedOverrides.get('abortTrackedSubAgents') as
        | AgentExecutionWorkerPersistenceService['abortTrackedSubAgents']
        | undefined) ??
      this.persistenceService.abortTrackedSubAgents.bind(
        this.persistenceService,
      )
    );
  }

  public set abortTrackedSubAgents(
    value: AgentExecutionWorkerPersistenceService['abortTrackedSubAgents'],
  ) {
    this.delegatedOverrides.set('abortTrackedSubAgents', value);
    this.persistenceService.abortTrackedSubAgents = value;
  }

  public get combineAbortSignals(): AgentExecutionWorkerPersistenceService['combineAbortSignals'] {
    return (
      (this.delegatedOverrides.get('combineAbortSignals') as
        | AgentExecutionWorkerPersistenceService['combineAbortSignals']
        | undefined) ??
      this.persistenceService.combineAbortSignals.bind(this.persistenceService)
    );
  }

  public set combineAbortSignals(
    value: AgentExecutionWorkerPersistenceService['combineAbortSignals'],
  ) {
    this.delegatedOverrides.set('combineAbortSignals', value);
    this.persistenceService.combineAbortSignals = value;
  }

  public get injectSubAgentCompletionNotice(): AgentExecutionWorkerPersistenceService['injectSubAgentCompletionNotice'] {
    return (
      (this.delegatedOverrides.get('injectSubAgentCompletionNotice') as
        | AgentExecutionWorkerPersistenceService['injectSubAgentCompletionNotice']
        | undefined) ??
      this.persistenceService.injectSubAgentCompletionNotice.bind(
        this.persistenceService,
      )
    );
  }

  public set injectSubAgentCompletionNotice(
    value: AgentExecutionWorkerPersistenceService['injectSubAgentCompletionNotice'],
  ) {
    this.delegatedOverrides.set('injectSubAgentCompletionNotice', value);
    this.persistenceService.injectSubAgentCompletionNotice = value;
  }

  public get summarizeSubAgentText(): AgentExecutionWorkerPersistenceService['summarizeSubAgentText'] {
    return (
      (this.delegatedOverrides.get('summarizeSubAgentText') as
        | AgentExecutionWorkerPersistenceService['summarizeSubAgentText']
        | undefined) ??
      this.persistenceService.summarizeSubAgentText.bind(
        this.persistenceService,
      )
    );
  }

  public set summarizeSubAgentText(
    value: AgentExecutionWorkerPersistenceService['summarizeSubAgentText'],
  ) {
    this.delegatedOverrides.set('summarizeSubAgentText', value);
    this.persistenceService.summarizeSubAgentText = value;
  }

  public get registerMemoryToolsProvider(): AgentExecutionWorkerPersistenceService['registerMemoryToolsProvider'] {
    return (
      (this.delegatedOverrides.get('registerMemoryToolsProvider') as
        | AgentExecutionWorkerPersistenceService['registerMemoryToolsProvider']
        | undefined) ??
      this.persistenceService.registerMemoryToolsProvider.bind(
        this.persistenceService,
      )
    );
  }

  public set registerMemoryToolsProvider(
    value: AgentExecutionWorkerPersistenceService['registerMemoryToolsProvider'],
  ) {
    this.delegatedOverrides.set('registerMemoryToolsProvider', value);
    this.persistenceService.registerMemoryToolsProvider = value;
  }

  public get cleanupConversationMemorySessions(): AgentExecutionWorkerPersistenceService['cleanupConversationMemorySessions'] {
    return (
      (this.delegatedOverrides.get('cleanupConversationMemorySessions') as
        | AgentExecutionWorkerPersistenceService['cleanupConversationMemorySessions']
        | undefined) ??
      this.persistenceService.cleanupConversationMemorySessions.bind(
        this.persistenceService,
      )
    );
  }

  public set cleanupConversationMemorySessions(
    value: AgentExecutionWorkerPersistenceService['cleanupConversationMemorySessions'],
  ) {
    this.delegatedOverrides.set('cleanupConversationMemorySessions', value);
    this.persistenceService.cleanupConversationMemorySessions = value;
  }

  public get toMemoryResourceInstance(): AgentExecutionWorkerPersistenceService['toMemoryResourceInstance'] {
    return (
      (this.delegatedOverrides.get('toMemoryResourceInstance') as
        | AgentExecutionWorkerPersistenceService['toMemoryResourceInstance']
        | undefined) ??
      this.persistenceService.toMemoryResourceInstance.bind(
        this.persistenceService,
      )
    );
  }

  public set toMemoryResourceInstance(
    value: AgentExecutionWorkerPersistenceService['toMemoryResourceInstance'],
  ) {
    this.delegatedOverrides.set('toMemoryResourceInstance', value);
    this.persistenceService.toMemoryResourceInstance = value;
  }

  public get emitPreparationPhase(): AgentExecutionWorkerPersistenceService['emitPreparationPhase'] {
    return (
      (this.delegatedOverrides.get('emitPreparationPhase') as
        | AgentExecutionWorkerPersistenceService['emitPreparationPhase']
        | undefined) ??
      this.persistenceService.emitPreparationPhase.bind(this.persistenceService)
    );
  }

  public set emitPreparationPhase(
    value: AgentExecutionWorkerPersistenceService['emitPreparationPhase'],
  ) {
    this.delegatedOverrides.set('emitPreparationPhase', value);
    this.persistenceService.emitPreparationPhase = value;
  }

  public get loadConversationExecutionContext(): AgentExecutionWorkerRuntimeService['loadConversationExecutionContext'] {
    return (
      (this.delegatedOverrides.get('loadConversationExecutionContext') as
        | AgentExecutionWorkerRuntimeService['loadConversationExecutionContext']
        | undefined) ??
      this.runtimeService.loadConversationExecutionContext.bind(
        this.runtimeService,
      )
    );
  }

  public set loadConversationExecutionContext(
    value: AgentExecutionWorkerRuntimeService['loadConversationExecutionContext'],
  ) {
    this.delegatedOverrides.set('loadConversationExecutionContext', value);
    this.runtimeService.loadConversationExecutionContext = value;
  }

  public get resolveConversationStartupRuntimeConfig(): AgentExecutionWorkerRuntimeService['resolveConversationStartupRuntimeConfig'] {
    return (
      (this.delegatedOverrides.get(
        'resolveConversationStartupRuntimeConfig',
      ) as
        | AgentExecutionWorkerRuntimeService['resolveConversationStartupRuntimeConfig']
        | undefined) ??
      this.runtimeService.resolveConversationStartupRuntimeConfig.bind(
        this.runtimeService,
      )
    );
  }

  public set resolveConversationStartupRuntimeConfig(
    value: AgentExecutionWorkerRuntimeService['resolveConversationStartupRuntimeConfig'],
  ) {
    this.delegatedOverrides.set(
      'resolveConversationStartupRuntimeConfig',
      value,
    );
    this.runtimeService.resolveConversationStartupRuntimeConfig = value;
  }

  public get selectConversationRoutingModelId(): AgentExecutionWorkerRuntimeService['selectConversationRoutingModelId'] {
    return (
      (this.delegatedOverrides.get('selectConversationRoutingModelId') as
        | AgentExecutionWorkerRuntimeService['selectConversationRoutingModelId']
        | undefined) ??
      this.runtimeService.selectConversationRoutingModelId.bind(
        this.runtimeService,
      )
    );
  }

  public set selectConversationRoutingModelId(
    value: AgentExecutionWorkerRuntimeService['selectConversationRoutingModelId'],
  ) {
    this.delegatedOverrides.set('selectConversationRoutingModelId', value);
    this.runtimeService.selectConversationRoutingModelId = value;
  }

  public get prepareRuntimeSession(): AgentExecutionWorkerRuntimeService['prepareRuntimeSession'] {
    return (
      (this.delegatedOverrides.get('prepareRuntimeSession') as
        | AgentExecutionWorkerRuntimeService['prepareRuntimeSession']
        | undefined) ??
      this.runtimeService.prepareRuntimeSession.bind(this.runtimeService)
    );
  }

  public set prepareRuntimeSession(
    value: AgentExecutionWorkerRuntimeService['prepareRuntimeSession'],
  ) {
    this.delegatedOverrides.set('prepareRuntimeSession', value);
    this.runtimeService.prepareRuntimeSession = value;
  }

  public get resolveConversationRuntime(): AgentExecutionWorkerRuntimeService['resolveConversationRuntime'] {
    return (
      (this.delegatedOverrides.get('resolveConversationRuntime') as
        | AgentExecutionWorkerRuntimeService['resolveConversationRuntime']
        | undefined) ??
      this.runtimeService.resolveConversationRuntime.bind(this.runtimeService)
    );
  }

  public set resolveConversationRuntime(
    value: AgentExecutionWorkerRuntimeService['resolveConversationRuntime'],
  ) {
    this.delegatedOverrides.set('resolveConversationRuntime', value);
    this.runtimeService.resolveConversationRuntime = value;
  }

  public get startConversationWorkspaceWatcher(): AgentExecutionWorkerRuntimeService['startConversationWorkspaceWatcher'] {
    return (
      (this.delegatedOverrides.get('startConversationWorkspaceWatcher') as
        | AgentExecutionWorkerRuntimeService['startConversationWorkspaceWatcher']
        | undefined) ??
      this.runtimeService.startConversationWorkspaceWatcher.bind(
        this.runtimeService,
      )
    );
  }

  public set startConversationWorkspaceWatcher(
    value: AgentExecutionWorkerRuntimeService['startConversationWorkspaceWatcher'],
  ) {
    this.delegatedOverrides.set('startConversationWorkspaceWatcher', value);
    this.runtimeService.startConversationWorkspaceWatcher = value;
  }

  public get loadPendingUserMessages(): AgentExecutionWorkerRuntimeService['loadPendingUserMessages'] {
    return (
      (this.delegatedOverrides.get('loadPendingUserMessages') as
        | AgentExecutionWorkerRuntimeService['loadPendingUserMessages']
        | undefined) ??
      this.runtimeService.loadPendingUserMessages.bind(this.runtimeService)
    );
  }

  public set loadPendingUserMessages(
    value: AgentExecutionWorkerRuntimeService['loadPendingUserMessages'],
  ) {
    this.delegatedOverrides.set('loadPendingUserMessages', value);
    this.runtimeService.loadPendingUserMessages = value;
  }

  public get loadConversationHistoryMessages(): AgentExecutionWorkerRuntimeService['loadConversationHistoryMessages'] {
    return (
      (this.delegatedOverrides.get('loadConversationHistoryMessages') as
        | AgentExecutionWorkerRuntimeService['loadConversationHistoryMessages']
        | undefined) ??
      this.runtimeService.loadConversationHistoryMessages.bind(
        this.runtimeService,
      )
    );
  }

  public set loadConversationHistoryMessages(
    value: AgentExecutionWorkerRuntimeService['loadConversationHistoryMessages'],
  ) {
    this.delegatedOverrides.set('loadConversationHistoryMessages', value);
    this.runtimeService.loadConversationHistoryMessages = value;
  }

  public get runConversationTurn(): AgentExecutionWorkerRuntimeService['runConversationTurn'] {
    return (
      (this.delegatedOverrides.get('runConversationTurn') as
        | AgentExecutionWorkerRuntimeService['runConversationTurn']
        | undefined) ??
      this.runtimeService.runConversationTurn.bind(this.runtimeService)
    );
  }

  public set runConversationTurn(
    value: AgentExecutionWorkerRuntimeService['runConversationTurn'],
  ) {
    this.delegatedOverrides.set('runConversationTurn', value);
    this.runtimeService.runConversationTurn = value;
  }

  public get describeConversationExecutionError(): AgentExecutionWorkerRuntimeService['describeConversationExecutionError'] {
    return (
      (this.delegatedOverrides.get('describeConversationExecutionError') as
        | AgentExecutionWorkerRuntimeService['describeConversationExecutionError']
        | undefined) ??
      this.runtimeService.describeConversationExecutionError.bind(
        this.runtimeService,
      )
    );
  }

  public set describeConversationExecutionError(
    value: AgentExecutionWorkerRuntimeService['describeConversationExecutionError'],
  ) {
    this.delegatedOverrides.set('describeConversationExecutionError', value);
    this.runtimeService.describeConversationExecutionError = value;
  }

  public get formatConversationExecutionErrorMessage(): AgentExecutionWorkerRuntimeService['formatConversationExecutionErrorMessage'] {
    return (
      (this.delegatedOverrides.get(
        'formatConversationExecutionErrorMessage',
      ) as
        | AgentExecutionWorkerRuntimeService['formatConversationExecutionErrorMessage']
        | undefined) ??
      this.runtimeService.formatConversationExecutionErrorMessage.bind(
        this.runtimeService,
      )
    );
  }

  public set formatConversationExecutionErrorMessage(
    value: AgentExecutionWorkerRuntimeService['formatConversationExecutionErrorMessage'],
  ) {
    this.delegatedOverrides.set(
      'formatConversationExecutionErrorMessage',
      value,
    );
    this.runtimeService.formatConversationExecutionErrorMessage = value;
  }

  public get isUpstreamModelStreamAbort(): AgentExecutionWorkerRuntimeService['isUpstreamModelStreamAbort'] {
    return (
      (this.delegatedOverrides.get('isUpstreamModelStreamAbort') as
        | AgentExecutionWorkerRuntimeService['isUpstreamModelStreamAbort']
        | undefined) ??
      this.runtimeService.isUpstreamModelStreamAbort.bind(this.runtimeService)
    );
  }

  public set isUpstreamModelStreamAbort(
    value: AgentExecutionWorkerRuntimeService['isUpstreamModelStreamAbort'],
  ) {
    this.delegatedOverrides.set('isUpstreamModelStreamAbort', value);
    this.runtimeService.isUpstreamModelStreamAbort = value;
  }

  public get readErrorCode(): AgentExecutionWorkerRuntimeService['readErrorCode'] {
    return (
      (this.delegatedOverrides.get('readErrorCode') as
        AgentExecutionWorkerRuntimeService['readErrorCode'] | undefined) ??
      this.runtimeService.readErrorCode.bind(this.runtimeService)
    );
  }

  public set readErrorCode(
    value: AgentExecutionWorkerRuntimeService['readErrorCode'],
  ) {
    this.delegatedOverrides.set('readErrorCode', value);
    this.runtimeService.readErrorCode = value;
  }

  private readonly logger = new Logger(AgentExecutionWorker.name);
  private readonly persistenceService: AgentExecutionWorkerPersistenceService;
  private readonly runtimeService: AgentExecutionWorkerRuntimeService;
  private readonly inputPreprocessorHandler =
    new InputPreprocessorHandlerImpl();

  constructor(
    private readonly db: DrizzleDB,
    private readonly agentRuntime: IAgentRuntime,
    private readonly adapterFactory: AgentAdapterFactory,
    private readonly executionService: AgentExecutionService,
    private readonly eventBridge: EventBridgeService,
    private readonly sandboxService: SandboxService,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly llmService?: LlmService,
    private readonly memoryToolsService?: MemoryToolsService,
    private readonly memoryFusionService?: MemoryFusionService,
    private readonly memoryResourceProvider?: MemoryResourceProvider,
    private readonly skillResolverService?: SkillResolverService,
    private readonly subAgentToolsProvider?: SubAgentToolsProvider,
    private readonly mcpService?: McpService,
    private readonly conversationTitleService?: ConversationTitleService,
    private readonly selfEvolutionToolsProvider?: SelfEvolutionToolsProvider,
    private readonly smartRoutingService?: SmartRoutingService,
    @Optional()
    injectedPersistenceService?: AgentExecutionWorkerPersistenceService,
    @Optional()
    injectedRuntimeService?: AgentExecutionWorkerRuntimeService,
  ) {
    super();
    this.persistenceService =
      injectedPersistenceService ??
      new AgentExecutionWorkerPersistenceService(
        db,
        agentRuntime,
        adapterFactory,
        executionService,
        eventBridge,
        sandboxService,
        workspaceIntegrationService,
        agentDefinitionService,
        llmService,
        memoryToolsService,
        memoryFusionService,
        memoryResourceProvider,
        skillResolverService,
        subAgentToolsProvider,
        mcpService,
        conversationTitleService,
        selfEvolutionToolsProvider,
        smartRoutingService,
      );
    this.runtimeService =
      injectedRuntimeService ??
      new AgentExecutionWorkerRuntimeService(
        this.persistenceService,
        db,
        agentRuntime,
        adapterFactory,
        executionService,
        eventBridge,
        sandboxService,
        workspaceIntegrationService,
        agentDefinitionService,
        llmService,
        memoryToolsService,
        memoryFusionService,
        memoryResourceProvider,
        skillResolverService,
        subAgentToolsProvider,
        mcpService,
        conversationTitleService,
        selfEvolutionToolsProvider,
        smartRoutingService,
      );
  }

  async process(job: Job<AgentConversationExecutionJobData>): Promise<void> {
    if (job.name !== AGENT_CONVERSATION_EXECUTION_JOB) {
      return;
    }

    await this.executeAgentLoop(job.data.conversationId, job.data.tenantId);
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<AgentConversationExecutionJobData> | undefined,
    error: Error,
  ) {
    if (!job) {
      return;
    }

    this.logger.error(
      `Agent conversation job failed for ${job.data.conversationId}: ${error.message}`,
      error.stack,
    );
  }

  async executeAgentLoop(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const abort = new AbortController();
    const activeRun = this.executionService.registerActiveRun(
      conversationId,
      abort,
    );

    if (!activeRun) {
      this.logger.debug(
        `Conversation ${conversationId} already has an active execution loop`,
      );
      return;
    }

    let runtime: IAgentRuntime | null = null;
    let session: AgentSession | null = null;
    let executionMetadata: ConversationExecutionMetadata = {};
    let conversationMetadata: Record<string, unknown> = {};
    let terminalStatus: 'completed' | 'cancelled' | 'failed' = 'completed';
    let conversationStatus: 'active' | 'paused' | 'ended' | 'failed';
    let conversationHasSandbox = false;
    let memorySessionIds: string[] = [];
    let currentPhase: PreparationPhase = 'queued';
    let currentPendingMessages: PendingMessage[] = [];
    const subAgentTracker: SubAgentExecutionTracker = {
      abortControllers: new Map(),
    };

    try {
      // Phase 1: queued — worker has picked up the job
      this.persistenceService.emitPreparationPhase(
        tenantId,
        conversationId,
        'queued',
      );

      // Phase 2: preparing — loading conversation execution context
      currentPhase = 'preparing';
      this.persistenceService.emitPreparationPhase(
        tenantId,
        conversationId,
        'preparing',
      );

      const context =
        await this.runtimeService.loadConversationExecutionContext(
          conversationId,
          tenantId,
        );

      if (!context) {
        return;
      }

      executionMetadata = context.executionMetadata;
      conversationMetadata = context.conversation.metadata;
      conversationStatus = context.conversation.status;
      conversationHasSandbox = context.hasSandbox;

      if (context.conversation.status !== 'active') {
        terminalStatus =
          context.conversation.status === 'failed' ? 'failed' : 'cancelled';
        await this.persistenceService.cleanupConversationMemorySessions(
          tenantId,
          executionMetadata.memorySessionIds,
        );
        return;
      }

      if (
        shouldRefreshConversationRuntimeForPublishedVersion(
          executionMetadata,
          context.publishedVersionId,
        )
      ) {
        this.logger.debug(
          `Conversation ${conversationId} detected published version drift, recreating runtime session with latest published config`,
        );

        await this.persistenceService.cleanupConversationMemorySessions(
          tenantId,
          executionMetadata.memorySessionIds,
        );

        if (!context.hasSandbox) {
          try {
            await this.sandboxService.endConversationSandbox(
              conversationId,
              tenantId,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to release conversation sandbox while refreshing published version for ${conversationId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        executionMetadata =
          await this.persistenceService.safeUpdateExecutionMetadata(
            tenantId,
            conversationId,
            buildExecutionMetadataForPublishedVersionRefresh(
              executionMetadata,
              context.publishedVersionId,
            ),
          );
        context.executionMetadata = executionMetadata;
        conversationMetadata = writeExecutionMetadata(
          conversationMetadata,
          executionMetadata,
        );
      }

      let seededPendingMessages: PendingMessage[] = [];
      if (
        !executionMetadata.sessionId &&
        extractStringArray(
          context.runtimeConfig.routingConfig?.candidateModelIds,
        ).length > 0
      ) {
        seededPendingMessages =
          await this.runtimeService.loadPendingUserMessages(
            conversationId,
            tenantId,
            executionMetadata.lastProcessedMessageId,
          );
      }

      // Phases 3-4 are emitted inside prepareRuntimeSession
      currentPhase = context.hasSandbox
        ? 'sandbox_creating'
        : 'agent_initializing';
      const runtimeSessionContext =
        await this.runtimeService.prepareRuntimeSession(
          context,
          conversationId,
          tenantId,
          abort.signal,
          subAgentTracker,
          context.conversation.agentDefinitionId,
          seededPendingMessages,
        );
      currentPhase = runtimeSessionContext.lastPhase;
      runtime = runtimeSessionContext.runtime;
      session = runtimeSessionContext.session;
      memorySessionIds = runtimeSessionContext.memorySessionIds ?? [];
      let shouldRebuildHistoryOnce =
        Boolean(context.executionMetadata.lastProcessedMessageId) &&
        !runtimeSessionContext.restoredExistingSession;

      const cancelRuntime = async () => {
        if (!runtime || !session) {
          return;
        }

        try {
          await runtime.cancel(session.id);
        } catch (error) {
          this.logger.warn(
            `Failed to cancel runtime session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };

      const cancelSubAgents = () => {
        this.persistenceService.abortTrackedSubAgents(
          subAgentTracker,
          abort.signal.reason,
        );
      };

      abort.signal.addEventListener(
        'abort',
        () => {
          cancelSubAgents();
          void cancelRuntime();
        },
        { once: true },
      );

      executionMetadata = await this.persistenceService.updateExecutionMetadata(
        tenantId,
        conversationId,
        {
          sessionId: session.id,
          ...(memorySessionIds.length ? { memorySessionIds } : {}),
          ...(context.publishedVersionId
            ? { loadedPublishedVersionId: context.publishedVersionId }
            : {}),
          runningState: 'running',
          errorMessage: null,
          errorCode: null,
          rawErrorMessage: null,
          failedPhase: null,
        },
      );
      conversationMetadata = writeExecutionMetadata(
        conversationMetadata,
        executionMetadata,
      );

      // Phase 5: running — agent loop is starting
      currentPhase = 'running';
      this.persistenceService.emitPreparationPhase(
        tenantId,
        conversationId,
        'running',
        {
          sandboxReused: runtimeSessionContext.sandboxReused,
        },
      );

      while (!abort.signal.aborted) {
        currentPendingMessages =
          seededPendingMessages.length > 0
            ? seededPendingMessages
            : await this.runtimeService.loadPendingUserMessages(
                conversationId,
                tenantId,
                executionMetadata.lastProcessedMessageId,
              );
        seededPendingMessages = [];

        if (currentPendingMessages.length === 0) {
          const waitResult = await this.executionService.waitForNotification(
            conversationId,
            abort.signal,
            AGENT_CONVERSATION_IDLE_WAIT_MS,
          );

          if (waitResult === 'notified') {
            continue;
          }

          if (waitResult === 'aborted') {
            terminalStatus = 'cancelled';
          }

          break;
        }

        const historyMessages =
          executionMetadata.lastProcessedMessageId && shouldRebuildHistoryOnce
            ? await this.runtimeService.loadConversationHistoryMessages(
                conversationId,
                tenantId,
                currentPendingMessages[0]?.id,
              )
            : [];

        const turnResult = await this.runtimeService.runConversationTurn(
          runtime,
          session,
          conversationId,
          tenantId,
          currentPendingMessages,
          Boolean(executionMetadata.lastProcessedMessageId),
          historyMessages,
          conversationMetadata,
        );

        const hadPriorAssistant = !!executionMetadata.lastAssistantMessageId;

        executionMetadata =
          await this.persistenceService.persistConversationTurn(
            conversationId,
            tenantId,
            currentPendingMessages,
            turnResult,
            session.id,
          );
        if (conversationHasSandbox) {
          await this.workspaceIntegrationService.captureConversationWorkspaceTreeSnapshot(
            conversationId,
            tenantId,
          );
        }
        conversationMetadata = writeExecutionMetadata(
          conversationMetadata,
          executionMetadata,
        );
        shouldRebuildHistoryOnce = false;

        // 首轮 assistant 回复后自动生成标题（fire-and-forget）
        if (
          !hadPriorAssistant &&
          executionMetadata.lastAssistantMessageId &&
          this.conversationTitleService
        ) {
          void this.conversationTitleService
            .generateTitle(conversationId, tenantId)
            .catch((error: unknown) => {
              this.logger.warn(
                `Failed to generate conversation title: ${error instanceof Error ? error.message : String(error)}`,
                { conversationId },
              );
            });
        }

        if (turnResult.stopReason === 'cancelled') {
          terminalStatus = 'cancelled';
          break;
        }

        currentPendingMessages = [];
      }
    } catch (error) {
      terminalStatus = abort.signal.aborted ? 'cancelled' : 'failed';
      const errorSummary =
        this.runtimeService.describeConversationExecutionError(error);
      const errorMessage = errorSummary.errorMessage;

      if (
        error instanceof ConversationTurnFailedError &&
        session &&
        currentPendingMessages.length > 0 &&
        turnResultHasPersistableOutput(error.turnResult)
      ) {
        try {
          executionMetadata =
            await this.persistenceService.persistConversationTurn(
              conversationId,
              tenantId,
              currentPendingMessages,
              error.turnResult,
              session.id,
              {
                incomplete: true,
                errorMessage,
                ...(errorSummary.errorCode
                  ? { errorCode: errorSummary.errorCode }
                  : {}),
                ...(errorSummary.rawErrorMessage
                  ? { rawErrorMessage: errorSummary.rawErrorMessage }
                  : {}),
              },
            );
          if (conversationHasSandbox) {
            await this.workspaceIntegrationService.captureConversationWorkspaceTreeSnapshot(
              conversationId,
              tenantId,
            );
          }
          conversationMetadata = writeExecutionMetadata(
            conversationMetadata,
            executionMetadata,
          );
          currentPendingMessages = [];
        } catch (persistError) {
          this.logger.warn(
            `Failed to persist partial assistant turn for ${conversationId}: ${
              persistError instanceof Error
                ? persistError.message
                : String(persistError)
            }`,
          );
        }
      }

      await this.persistenceService.safeUpdateExecutionMetadata(
        tenantId,
        conversationId,
        {
          ...executionMetadata,
          runningState: terminalStatus,
          errorMessage: terminalStatus === 'failed' ? errorMessage : null,
          errorCode:
            terminalStatus === 'failed'
              ? (errorSummary.errorCode ?? null)
              : null,
          rawErrorMessage:
            terminalStatus === 'failed'
              ? (errorSummary.rawErrorMessage ?? null)
              : null,
          failedPhase:
            terminalStatus === 'failed' && currentPhase !== 'running'
              ? currentPhase
              : null,
        },
      );

      if (terminalStatus === 'failed') {
        await this.persistenceService.cleanupConversationMemorySessions(
          tenantId,
          executionMetadata.memorySessionIds ?? memorySessionIds,
        );

        if (conversationHasSandbox && currentPhase === 'sandbox_creating') {
          try {
            await this.sandboxService.endConversationSandbox(
              conversationId,
              tenantId,
            );
          } catch (sandboxCleanupError) {
            this.logger.warn(
              `Failed to release sandbox binding after sandbox creation failure for ${conversationId}: ${
                sandboxCleanupError instanceof Error
                  ? sandboxCleanupError.message
                  : String(sandboxCleanupError)
              }`,
            );
          }
        }
      }

      this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
        executionId: conversationId,
        status: terminalStatus,
        executionType: 'conversation',
        errorMessage,
        ...(terminalStatus === 'failed' && errorMessage
          ? { error: errorMessage }
          : {}),
        // Attach the phase where failure occurred so clients can show which step failed
        ...(terminalStatus === 'failed' && currentPhase !== 'running'
          ? { failedPhase: currentPhase }
          : {}),
      });

      if (!abort.signal.aborted) {
        throw error;
      }

      return;
    } finally {
      this.executionService.clearActiveRun(conversationId, abort);
    }

    await this.persistenceService.safeUpdateExecutionMetadata(
      tenantId,
      conversationId,
      {
        ...executionMetadata,
        runningState: terminalStatus === 'completed' ? 'idle' : terminalStatus,
        errorMessage: null,
        errorCode: null,
        rawErrorMessage: null,
        failedPhase: null,
      },
    );

    if (
      conversationHasSandbox &&
      conversationStatus === 'active' &&
      terminalStatus !== 'cancelled'
    ) {
      await this.sandboxService.scheduleConversationIdleAutoEnd(
        conversationId,
        tenantId,
      );
    }

    if (conversationStatus !== 'active') {
      await this.persistenceService.cleanupConversationMemorySessions(
        tenantId,
        executionMetadata.memorySessionIds ?? memorySessionIds,
      );
    }

    this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
      executionId: conversationId,
      status: terminalStatus,
      executionType: 'conversation',
    });
  }
}
