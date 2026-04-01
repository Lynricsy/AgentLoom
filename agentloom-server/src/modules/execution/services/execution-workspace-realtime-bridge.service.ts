import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EventBridgeService } from './event-bridge.service';
import type { FileChangeEvent } from '../../agent-execution/workspace-integration.service';

@Injectable()
export class ExecutionWorkspaceRealtimeBridgeService {
  constructor(private readonly eventBridge: EventBridgeService) {}

  @OnEvent('workspace.file_change')
  handleWorkspaceFileChange(payload: FileChangeEvent): void {
    if (!payload.executionId || !payload.stepId) {
      return;
    }

    for (const path of payload.changedFiles) {
      this.eventBridge.emitStepAgentEvent(
        payload.tenantId,
        payload.executionId,
        {
          stepId: payload.stepId,
          event: {
            type: 'file_change',
            path,
            changeType: 'modified',
          },
        },
      );
    }
  }
}
