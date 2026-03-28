import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentCanvasStore } from './agent-canvas.store';

const { putMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    put: putMock,
  },
}));

describe('agentCanvasStore.saveCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentCanvasStore.getState().actions.reset();
  });

  it('sends the canvas payload shape expected by the backend and reads the nested version response', async () => {
    const canvasViewport = { x: 12, y: 24, zoom: 0.85 };
    const globalSandboxConfig = {
      enabled: true,
      cpuLimit: 2,
      memoryLimitMb: 1024,
      timeoutSeconds: 300,
    };
    const inputSchema = {
      type: 'object' as const,
      properties: {
        topic: { type: 'string' },
      },
      required: ['topic'],
    };

    useAgentCanvasStore.setState({
      agentId: 'agent-1',
      nodes: [
        {
          id: 'agent-main',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Main Agent',
            nodeType: 'agent',
            category: 'agent',
            config: {},
            inputPorts: [],
            outputPorts: [],
          },
        },
      ],
      edges: [],
      viewport: canvasViewport,
      globalSandboxConfig,
      inputSchema,
      isDirty: true,
      version: 3,
    });

    putMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { version: 4 } }),
    });

    await useAgentCanvasStore.getState().actions.saveCanvas();

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith('agent-definitions/agent-1/canvas', {
      json: {
        canvasNodes: expect.any(Array),
        canvasEdges: [],
        canvasViewport,
        globalSandboxConfig,
        inputSchema,
      },
    });

    const requestBody = putMock.mock.calls[0]?.[1]?.json as Record<string, unknown>;
    expect(requestBody.nodes).toBeUndefined();
    expect(requestBody.edges).toBeUndefined();
    expect(requestBody.viewport).toBeUndefined();

    const state = useAgentCanvasStore.getState();
    expect(state.version).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.lastSavedAt).not.toBeNull();
  });
});
