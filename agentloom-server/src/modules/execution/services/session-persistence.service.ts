import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '../../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import type { AgentSession } from '../../agent/types/agent-session.types';

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
    const raw = data as unknown as SerializedSession;
    return {
      id: raw.id,
      agentId: raw.agentId,
      mode: raw.mode as AgentSession['mode'],
      context: {
        history: (raw.context?.history ?? []) as AgentSession['context']['history'],
        cwd: raw.context?.cwd,
        mcpServers: raw.context?.mcpServers as AgentSession['context']['mcpServers'],
        workflowState: raw.context?.workflowState as AgentSession['context']['workflowState'],
      },
      status: raw.status as AgentSession['status'],
      tenantId: raw.tenantId,
      llmModelConfigId: raw.llmModelConfigId,
      systemPrompt: raw.systemPrompt,
      autonomyMode: raw.autonomyMode,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }

  async saveToCheckpoint(
    tenantId: string,
    stepId: string,
    session: AgentSession,
  ): Promise<void> {
    const [step] = await this.tenantDb
      .select({ checkpointData: schema.executionSteps.checkpointData })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    const existing = (step?.checkpointData ?? {}) as Record<string, unknown>;

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        checkpointData: {
          ...existing,
          session: this.serializeSession(session),
        },
      })
      .where(eq(schema.executionSteps.id, stepId));

    this.logger.debug(`Session ${session.id} saved to checkpoint for step ${stepId}`);
  }

  async loadFromCheckpoint(
    tenantId: string,
    stepId: string,
  ): Promise<AgentSession | null> {
    const [step] = await this.tenantDb
      .select({ checkpointData: schema.executionSteps.checkpointData })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    const checkpointData = (step?.checkpointData ?? {}) as Record<string, unknown>;

    if (!checkpointData.session) {
      return null;
    }

    this.logger.debug(`Session loaded from checkpoint for step ${stepId}`);
    return this.deserializeSession(checkpointData.session as Record<string, unknown>);
  }
}
