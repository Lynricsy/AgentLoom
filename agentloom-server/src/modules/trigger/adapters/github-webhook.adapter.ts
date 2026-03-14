import { Injectable } from '@nestjs/common';

import type { ApiEventTriggerConfig } from '../../../database/schema/workflow-triggers.schema';
import type { EventPayload, EventSourceAdapter } from './event-source.adapter';

@Injectable()
export class GithubWebhookAdapter implements EventSourceAdapter {
  readonly name = 'github';

  validateEvent(_payload: EventPayload): boolean {
    return true;
  }

  matchesTrigger(
    _payload: EventPayload,
    _triggerConfig: ApiEventTriggerConfig,
  ): boolean {
    return false;
  }
}
