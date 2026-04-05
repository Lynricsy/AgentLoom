import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentCanvasStore } from './agent-canvas.store';

const { getMock, putMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(() => ({ json: vi.fn().mockResolvedValue({}) })),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    post: postMock,
  },
}));

describe('agentCanvasStore', () => {
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
      memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de2'],
      sandboxLifecycle: 'persistent',
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
        memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de2'],
        sandboxLifecycle: 'persistent',
        workspaceSnapshotId: null,
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

  it('hydrates input schema, memory bindings, and sandbox lifecycle from the detail response', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'agent-1',
          tenantId: 'tenant-1',
          name: 'Loaded Agent',
          slug: 'loaded-agent',
          description: null,
          systemPrompt: null,
          nodes: [
            {
              id: 'agent-main',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {
                label: 'Agent Main',
                nodeType: 'agent-main' as unknown as string,
                category: 'agent',
                description: 'old snapshot',
                config: {},
                inputPorts: [
                  {
                    id: 'memory-in',
                    label: '记忆',
                    direction: 'input',
                    dataType: 'knowledge',
                    required: false,
                    multiple: true,
                    maxConnections: null,
                    schema: { kind: 'knowledge', title: '记忆' },
                  },
                ],
                outputPorts: [],
              },
            },
          ],
          edges: [],
          viewport: null,
          sandboxConfig: { lifecycleMode: 'persistent' },
          workspaceSnapshotId: null,
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Prompt' },
            },
            required: ['question'],
          },
          memoryInstanceIds: ['019d2a7c-c19c-7a9c-8233-db2b87a23de3'],
          sandboxLifecycle: 'persistent',
          version: 7,
          status: 'draft',
          publishedVersionId: null,
          createdBy: 'user-1',
          updatedBy: 'user-1',
          createdAt: '2026-03-28T00:00:00.000Z',
          updatedAt: '2026-03-28T00:00:00.000Z',
        },
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent('agent-1');

    const state = useAgentCanvasStore.getState();
    expect(state.agentId).toBe('agent-1');
    expect(state.agentName).toBe('Loaded Agent');
    expect(state.inputSchema).toEqual({
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Prompt' },
      },
      required: ['question'],
    });
    expect(state.memoryInstanceIds).toEqual([
      '019d2a7c-c19c-7a9c-8233-db2b87a23de3',
    ]);
    expect(state.sandboxLifecycle).toBe('persistent');
    expect(state.globalSandboxConfig.lifecycleMode).toBe('persistent');
    expect(
      state.nodes[0]?.data.inputPorts.find((port) => port.id === 'memory-in')?.dataType,
    ).toBe('memory');
  });

  it('rehydrates malformed stored smart-routing ports from registry defaults', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'agent-2',
          tenantId: 'tenant-1',
          name: 'Broken Router Agent',
          slug: 'broken-router-agent',
          description: null,
          systemPrompt: null,
          nodes: [
            {
              id: 'router-1',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {
                label: 'Legacy Router',
                nodeType: 'smart-routing',
                category: 'agent',
                description: '端口只剩 id',
                config: {
                  strategy: 'FALLBACK_CHAIN',
                },
                inputPorts: [{ id: 'model-in-0' }, { id: 'model-in-1' }],
                outputPorts: [{ id: 'model-out' }],
              },
            },
          ],
          edges: [],
          viewport: null,
          sandboxConfig: {},
          workspaceSnapshotId: null,
          inputSchema: null,
          memoryInstanceIds: [],
          sandboxLifecycle: 'session',
          version: 1,
          runtimeMode: 'sandbox',
          status: 'draft',
          publishedVersionId: null,
          createdBy: 'user-1',
          updatedBy: 'user-1',
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
        },
      }),
    });

    await useAgentCanvasStore.getState().actions.loadAgent('agent-2');

    const node = useAgentCanvasStore
      .getState()
      .nodes.find((item) => item.id === 'router-1');

    expect(node?.data.inputPorts).toMatchObject([
      {
        id: 'model-in-0',
        direction: 'input',
        dataType: 'model',
        schema: { kind: 'model' },
      },
      {
        id: 'model-in-1',
        direction: 'input',
        dataType: 'model',
        schema: { kind: 'model' },
      },
    ]);
    expect(node?.data.outputPorts).toMatchObject([
      {
        id: 'model-out',
        direction: 'output',
        dataType: 'model',
        schema: { kind: 'model' },
      },
    ]);
  });
});
