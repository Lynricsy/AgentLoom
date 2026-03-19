import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import type { ConversationReplayEntry } from '../../agent/types/conversation-history.types';
import type { AgentSession } from '../../agent/types/agent-session.types';
import {
  ContentBlockArraySchema,
  ContentBlockSchema,
} from '../../agent/types/content-block.types';

interface SerializedSession {
  id: string;
  agentId: string;
  mode: string;
  context: {
    history: unknown[];
    cwd?: string;
    mcpServers?: Record<string, unknown>;
    workflowState?: Record<string, unknown>;
  };
  status: string;
  tenantId?: string;
  llmModelConfigId?: string;
  systemPrompt?: string;
  autonomyMode?: string;
  createdAt: string;
  updatedAt: string;
}

interface SerializedConversationSessionRow {
  sessionSnapshot: Record<string, unknown>;
  replayEntries: ConversationReplayEntry[];
}

const SessionModeSchema = z.enum(['workflow', 'conversation']);
const SessionStatusSchema = z.enum(['active', 'paused', 'completed', 'error']);
const ToolCallStatusSchema = z.enum([
  'pending',
  'awaiting_permission',
  'denied',
  'in_progress',
  'completed',
  'failed',
]);
const ToolCallTransitionSourceSchema = z.enum(['runtime', 'worker', 'user']);
const IsoDateTimeSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), '必须为有效 ISO 时间');
const McpServerConfigSchema = z
  .object({
    transportType: z.enum(['stdio', 'sse', 'streamable_http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();
const SessionContextSchema = z
  .object({
    history: z.array(ContentBlockSchema).default([]),
    cwd: z.string().optional(),
    mcpServers: z.record(z.string(), McpServerConfigSchema).optional(),
    workflowState: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
const SerializedSessionSchema = z
  .object({
    id: z.string().min(1),
    agentId: z.string().min(1),
    mode: SessionModeSchema,
    context: SessionContextSchema,
    status: SessionStatusSchema,
    tenantId: z.string().optional(),
    llmModelConfigId: z.string().optional(),
    systemPrompt: z.string().optional(),
    autonomyMode: z.string().optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .passthrough();
const ToolPermissionRequestSchema = z
  .object({
    description: z.string().min(1),
    resourcePaths: z.array(z.string()).optional(),
  })
  .passthrough();
const ToolCallTransitionRecordSchema = z
  .object({
    from: ToolCallStatusSchema.optional(),
    to: ToolCallStatusSchema,
    timestamp: IsoDateTimeSchema,
    source: ToolCallTransitionSourceSchema,
  })
  .passthrough();
const ToolCallEventSchema = z
  .object({
    id: z.string().min(1),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    status: ToolCallStatusSchema,
    transitions: z.array(ToolCallTransitionRecordSchema).optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    permissionRequest: ToolPermissionRequestSchema.optional(),
  })
  .passthrough();
const ReplayableAgentEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('plan'),
      title: z.string(),
      content: z.string(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('message_chunk'),
      content: z.string(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool_call'),
      call: ToolCallEventSchema,
    })
    .passthrough(),
  z
    .object({
      type: z.literal('decision'),
      suggestedContent: z.string(),
      autonomyMode: z.string().optional(),
      selectedAction: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      confidence: z.number().optional(),
      rationale: z.string().optional(),
    })
    .passthrough(),
]);
const ConversationReplayEntrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('user_message'),
      content: ContentBlockArraySchema,
    })
    .passthrough(),
  z
    .object({
      kind: z.literal('agent_event'),
      event: ReplayableAgentEventSchema,
    })
    .passthrough(),
]);
const ConversationReplayEntriesSchema = z.array(ConversationReplayEntrySchema);

export class ConversationSessionDataIntegrityError extends Error {
  constructor(
    readonly sessionId: string,
    readonly detail: string,
  ) {
    super(`Conversation session ${sessionId} has corrupted ${detail}`);
    this.name = 'ConversationSessionDataIntegrityError';
  }
}

function buildIntegrityError(
  sessionId: string,
  detail: string,
  error: z.ZodError,
): ConversationSessionDataIntegrityError {
  const [issue] = error.issues;
  const path = issue?.path.length ? issue.path.join('.') : '<root>';
  return new ConversationSessionDataIntegrityError(
    sessionId,
    `${detail} at ${path}`,
  );
}

@Injectable()
export class SessionPersistenceService {
  private readonly logger = new Logger(SessionPersistenceService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  serializeSession(session: AgentSession): SerializedSession {
    return {
      id: session.id,
      agentId: session.agentId,
      mode: session.mode,
      context: {
        history: session.context.history,
        cwd: session.context.cwd,
        mcpServers: session.context.mcpServers as
          | Record<string, unknown>
          | undefined,
        workflowState: session.context.workflowState as
          | Record<string, unknown>
          | undefined,
      },
      status: session.status,
      tenantId: session.tenantId,
      llmModelConfigId: session.llmModelConfigId,
      systemPrompt: session.systemPrompt,
      autonomyMode: session.autonomyMode,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  deserializeSession(data: Record<string, unknown>): AgentSession {
    const parsed = SerializedSessionSchema.safeParse(data);
    if (!parsed.success) {
      throw buildIntegrityError('checkpoint', 'session snapshot', parsed.error);
    }

    const raw = parsed.data;
    return {
      id: raw.id,
      agentId: raw.agentId,
      mode: raw.mode,
      context: {
        history: raw.context.history,
        cwd: raw.context?.cwd,
        mcpServers: raw.context?.mcpServers,
        workflowState: raw.context?.workflowState,
      },
      status: raw.status,
      tenantId: raw.tenantId,
      llmModelConfigId: raw.llmModelConfigId,
      systemPrompt: raw.systemPrompt,
      autonomyMode: raw.autonomyMode,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }

  async saveToCheckpoint(
    _tenantId: string,
    stepId: string,
    session: AgentSession,
  ): Promise<void> {
    const [step] = await this.tenantDb
      .select({ checkpointData: schema.executionSteps.checkpointData })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    const existing = step?.checkpointData ?? {};

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        checkpointData: {
          ...existing,
          session: this.serializeSession(session),
        },
      })
      .where(eq(schema.executionSteps.id, stepId));

    this.logger.debug(
      `Session ${session.id} saved to checkpoint for step ${stepId}`,
    );
  }

  async loadFromCheckpoint(
    _tenantId: string,
    stepId: string,
  ): Promise<AgentSession | null> {
    const [step] = await this.tenantDb
      .select({ checkpointData: schema.executionSteps.checkpointData })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    const checkpointData = step?.checkpointData ?? {};

    if (!checkpointData.session) {
      return null;
    }

    this.logger.debug(`Session loaded from checkpoint for step ${stepId}`);
    return this.deserializeSession(
      checkpointData.session as Record<string, unknown>,
    );
  }

  async saveConversationSession(session: AgentSession): Promise<void> {
    const sessionSnapshot = this.serializeSession(session) as unknown as Record<
      string,
      unknown
    >;
    const [existing] = await this.tenantDb
      .select({
        sessionId: schema.acpConversationSessions.sessionId,
      })
      .from(schema.acpConversationSessions)
      .where(eq(schema.acpConversationSessions.sessionId, session.id));

    if (existing) {
      await this.tenantDb
        .update(schema.acpConversationSessions)
        .set({
          tenantId: session.tenantId ?? '',
          agentId: session.agentId,
          sessionSnapshot,
          updatedAt: new Date(),
        })
        .where(eq(schema.acpConversationSessions.sessionId, session.id));

      return;
    }

    await this.tenantDb.insert(schema.acpConversationSessions).values({
      sessionId: session.id,
      tenantId: session.tenantId ?? '',
      agentId: session.agentId,
      sessionSnapshot,
      replayEntries: [],
    });
  }

  async loadConversationSession(sessionId: string): Promise<AgentSession | null> {
    const [record] = await this.tenantDb
      .select({
        sessionSnapshot: schema.acpConversationSessions.sessionSnapshot,
      })
      .from(schema.acpConversationSessions)
      .where(eq(schema.acpConversationSessions.sessionId, sessionId));

    if (!record) {
      return null;
    }

    const parsed = SerializedSessionSchema.safeParse(record.sessionSnapshot);
    if (!parsed.success) {
      throw buildIntegrityError(sessionId, 'session snapshot', parsed.error);
    }

    return this.deserializeSession(parsed.data);
  }

  async appendConversationReplayEntry(
    session: AgentSession,
    replayEntry: ConversationReplayEntry,
  ): Promise<void> {
    const [record] = await this.tenantDb
      .select({
        replayEntries: schema.acpConversationSessions.replayEntries,
        sessionSnapshot: schema.acpConversationSessions.sessionSnapshot,
      })
      .from(schema.acpConversationSessions)
      .where(eq(schema.acpConversationSessions.sessionId, session.id));

    if (!record) {
      throw new Error(`Conversation session not found: ${session.id}`);
    }

    const replayEntries = [
      ...this.readReplayEntries(session.id, record),
      replayEntry,
    ] satisfies ConversationReplayEntry[];

    await this.tenantDb
      .update(schema.acpConversationSessions)
      .set({
        replayEntries,
        sessionSnapshot: this.serializeSession(session) as unknown as Record<
          string,
          unknown
        >,
        updatedAt: new Date(),
      })
      .where(eq(schema.acpConversationSessions.sessionId, session.id));
  }

  async loadConversationReplay(
    sessionId: string,
  ): Promise<ConversationReplayEntry[]> {
    const [record] = await this.tenantDb
      .select({
        replayEntries: schema.acpConversationSessions.replayEntries,
      })
      .from(schema.acpConversationSessions)
      .where(eq(schema.acpConversationSessions.sessionId, sessionId));

    return this.readReplayEntries(sessionId, record);
  }

  private readReplayEntries(
    sessionId: string,
    record: Partial<SerializedConversationSessionRow> | undefined,
  ): ConversationReplayEntry[] {
    if (!record) {
      return [];
    }

    const parsed = ConversationReplayEntriesSchema.safeParse(record.replayEntries);
    if (!parsed.success) {
      throw buildIntegrityError(sessionId, 'replay entries', parsed.error);
    }

    return parsed.data;
  }
}
