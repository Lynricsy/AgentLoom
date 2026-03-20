import { Injectable } from '@nestjs/common';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import type { EventPayload, EventSourceAdapter } from './event-source.adapter';

@Injectable()
export class GenericEventAdapter implements EventSourceAdapter {
  readonly name = 'generic';

  validateEvent(
    _payload: EventPayload,
    _config?: ApiEventTriggerConfig,
  ): boolean {
    return true;
  }

  matchesTrigger(
    payload: EventPayload,
    triggerConfig: ApiEventTriggerConfig,
  ): boolean {
    if (!triggerConfig.eventType) {
      return true;
    }

    return (
      payload.type.toLowerCase() === triggerConfig.eventType.toLowerCase()
    );
  }
}
