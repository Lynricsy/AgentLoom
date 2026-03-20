import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider'
import { DRIZZLE, type DrizzleDB } from '../../database/database.module'
import * as schema from '../../database/schema'
import type { ApiEventTriggerConfig } from '../../database/schema/workflow-triggers.schema'
import { ExecutionService } from '../execution/execution.service'
import { EventSourceAdapterRegistry } from './adapters/event-source-adapter.registry'
import type { EventPayload } from './adapters/event-source.adapter'
import { TriggerHistoryService } from './trigger-history.service'
import { TriggerService } from './trigger.service'
import { SYSTEM_TRIGGER_USER_ID } from './trigger.constants'

export const IngestEventSchema = z.object({
  source: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
})

export type IngestEventDto = z.infer<typeof IngestEventSchema>

export type IngestionResult = {
  triggeredCount: number
  executions: Array<{ triggerId: string; executionId: string }>
  skippedCount: number
}

@Injectable()
export class ApiEventIngestionService {
  private readonly logger = new Logger(ApiEventIngestionService.name)

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly executionService: ExecutionService,
    private readonly triggerHistoryService: TriggerHistoryService,
    private readonly triggerService: TriggerService,
    private readonly adapterRegistry: EventSourceAdapterRegistry,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db)
  }

  async ingestEvent(
    tenantId: string,
    dto: IngestEventDto,
  ): Promise<IngestionResult> {
    const parsed = IngestEventSchema.parse(dto)

    const payload: EventPayload = {
      source: parsed.source,
      type: parsed.type,
      data: parsed.data,
      receivedAt: new Date(),
    }

    const candidates = await this.findEnabledApiEventTriggers(tenantId)

    const executions: Array<{ triggerId: string; executionId: string }> = []
    let skippedCount = 0

    for (const trigger of candidates) {
      const config = trigger.config as ApiEventTriggerConfig

      const adapter = this.resolveAdapter(parsed.source)

      if (!adapter.matchesTrigger(payload, config)) {
        skippedCount++
        continue
      }

      let executionId: string | undefined

      try {
        const execution = await this.executionService.runWorkflow(
          trigger.workflowDefinitionId,
          {
            inputParams: { ...parsed.data, _eventSource: parsed.source, _eventType: parsed.type },
            launchSource: 'api-event-trigger',
            triggerType: 'api',
          },
          tenantId,
          SYSTEM_TRIGGER_USER_ID,
        )

        executionId = execution.id
        executions.push({ triggerId: trigger.id, executionId: execution.id })

        await this.recordHistory(tenantId, trigger.id, payload, execution.id)
        await this.triggerService.markTriggered(tenantId, trigger.id)

        this.logger.log(
          JSON.stringify({
            action: 'api_event_trigger_fired',
            triggerId: trigger.id,
            executionId: execution.id,
            source: parsed.source,
            type: parsed.type,
            tenantId,
          }),
        )
      } catch (error) {
        await this.recordFailedHistory(tenantId, trigger.id, payload, error)
        this.logger.error(
          JSON.stringify({
            action: 'api_event_trigger_failed',
            triggerId: trigger.id,
            executionId,
            source: parsed.source,
            type: parsed.type,
            tenantId,
            error: this.getErrorMessage(error),
          }),
        )
      }
    }

    return {
      triggeredCount: executions.length,
      executions,
      skippedCount,
    }
  }

  private async findEnabledApiEventTriggers(tenantId: string) {
    return this.tenantDb
      .select()
      .from(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.tenantId, tenantId),
          eq(schema.workflowTriggers.type, 'api_event'),
          eq(schema.workflowTriggers.isEnabled, true),
        ),
      )
  }

  private resolveAdapter(source: string) {
    try {
      return this.adapterRegistry.getAdapter(source)
    } catch {
      return this.adapterRegistry.getAdapter('generic')
    }
  }

  private async recordHistory(
    tenantId: string,
    triggerId: string,
    payload: EventPayload,
    executionId: string,
  ): Promise<void> {
    try {
      await this.triggerHistoryService.record(tenantId, {
        triggerId,
        status: 'success',
        executionId,
        payload: { source: payload.source, type: payload.type, data: payload.data },
      })
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'api_event_history_record_failed',
          triggerId,
          tenantId,
          error: this.getErrorMessage(error),
        }),
      )
    }
  }

  private async recordFailedHistory(
    tenantId: string,
    triggerId: string,
    payload: EventPayload,
    error: unknown,
  ): Promise<void> {
    try {
      await this.triggerHistoryService.record(tenantId, {
        triggerId,
        status: 'failed',
        errorMessage: this.getErrorMessage(error),
        payload: { source: payload.source, type: payload.type, data: payload.data },
      })
    } catch (bookkeepingError) {
      this.logger.error(
        JSON.stringify({
          action: 'api_event_failure_history_failed',
          triggerId,
          tenantId,
          originalError: this.getErrorMessage(error),
          bookkeepingError: this.getErrorMessage(bookkeepingError),
        }),
      )
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return '未知错误'
  }
}
