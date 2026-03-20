import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';

export interface EventPayload {
  source: string;
  type: string;
  data: Record<string, unknown>;
  receivedAt: Date;
}

export interface EventSourceAdapter {
  readonly name: string;
  validateEvent(payload: EventPayload, config?: ApiEventTriggerConfig): boolean;
  matchesTrigger(payload: EventPayload, triggerConfig: ApiEventTriggerConfig): boolean;
}
