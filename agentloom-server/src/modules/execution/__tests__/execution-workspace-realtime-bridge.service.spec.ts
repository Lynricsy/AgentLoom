import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ExecutionWorkspaceRealtimeBridgeService } from '../services/execution-workspace-realtime-bridge.service';

const TENANT_ID = 'tenant-001';
const EXECUTION_ID = 'exec-001';
const STEP_ID = 'step-001';

const mockEventBridge = {
  emitStepAgentEvent: vi.fn(),
};

describe('ExecutionWorkspaceRealtimeBridgeService', () => {
  let service: ExecutionWorkspaceRealtimeBridgeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExecutionWorkspaceRealtimeBridgeService(
      mockEventBridge as never,
    );
  });

  it('应把 workflow workspace.file_change 映射为 execution step agent-event', () => {
    service.handleWorkspaceFileChange({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      changedFiles: ['src/main.ts', 'README.md'],
      timestamp: new Date().toISOString(),
    });

    expect(mockEventBridge.emitStepAgentEvent).toHaveBeenCalledTimes(2);
    expect(mockEventBridge.emitStepAgentEvent).toHaveBeenNthCalledWith(
      1,
      TENANT_ID,
      EXECUTION_ID,
      {
        stepId: STEP_ID,
        event: {
          type: 'file_change',
          path: 'src/main.ts',
          changeType: 'modified',
        },
      },
    );
  });

  it('conversation 维度的 workspace.file_change 不应误发到 execution', () => {
    service.handleWorkspaceFileChange({
      tenantId: TENANT_ID,
      conversationId: 'conv-001',
      changedFiles: ['src/main.ts'],
      timestamp: new Date().toISOString(),
    });

    expect(mockEventBridge.emitStepAgentEvent).not.toHaveBeenCalled();
  });
});
