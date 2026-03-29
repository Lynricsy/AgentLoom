import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SandboxResourceProvider } from '../sandbox-resource.provider';
import type { SandboxService } from '../../sandbox/sandbox.service';
import type { SandboxSession } from '../../../database/schema';

const createMockSandboxService = vi.hoisted(() => {
  return () => ({
    createSandboxSession: vi.fn(),
    destroySandbox: vi.fn(),
    destroyConversationSandbox: vi.fn(),
    findByExecutionId: vi.fn(),
    findByConversationId: vi.fn(),
  });
});

function makeFakeSession(
  overrides: Partial<SandboxSession> = {},
): SandboxSession {
  return {
    id: 'session-1',
    executionId: null,
    agentConversationId: null,
    sandboxNodeId: null,
    tenantId: 'tenant-1',
    config: { image: 'node:20' } as any,
    status: 'ready',
    containerId: null,
    workspacePath: null,
    startedAt: null,
    stoppedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SandboxResourceProvider', () => {
  let provider: SandboxResourceProvider;
  let mockSandboxService: ReturnType<typeof createMockSandboxService>;

  beforeEach(() => {
    mockSandboxService = createMockSandboxService();
    provider = new SandboxResourceProvider(
      mockSandboxService as unknown as SandboxService,
    );
  });

  it('should have type "sandbox"', () => {
    expect(provider.type).toBe('sandbox');
  });

  describe('create', () => {
    it('should delegate to SandboxService.createSandboxSession', async () => {
      const session = makeFakeSession({ executionId: 'exec-1' });
      mockSandboxService.createSandboxSession.mockResolvedValue(session);

      const result = await provider.create({
        sandboxNodeId: 'node-1',
        config: { image: 'node:20' } as any,
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      });

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
        sandboxNodeId: 'node-1',
        config: { image: 'node:20' },
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        agentConversationId: undefined,
      });
      expect(result).toEqual({
        sessionId: session.id,
        session,
        tenantId: 'tenant-1',
      });
    });

    it('should pass agentConversationId when provided', async () => {
      const session = makeFakeSession({ agentConversationId: 'conv-1' });
      mockSandboxService.createSandboxSession.mockResolvedValue(session);

      await provider.create({
        sandboxNodeId: null,
        config: { image: 'node:20' } as any,
        tenantId: 'tenant-1',
        agentConversationId: 'conv-1',
      });

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        expect.objectContaining({ agentConversationId: 'conv-1' }),
      );
    });
  });

  describe('destroy', () => {
    it('should use destroyConversationSandbox when agentConversationId present', async () => {
      const session = makeFakeSession({ agentConversationId: 'conv-1' });

      await provider.destroy({
        sessionId: session.id,
        session,
        tenantId: 'tenant-1',
      });

      expect(
        mockSandboxService.destroyConversationSandbox,
      ).toHaveBeenCalledWith('conv-1', 'tenant-1');
      expect(mockSandboxService.destroySandbox).not.toHaveBeenCalled();
    });

    it('should use destroySandbox when only executionId present', async () => {
      const session = makeFakeSession({ executionId: 'exec-1' });

      await provider.destroy({
        sessionId: session.id,
        session,
        tenantId: 'tenant-1',
      });

      expect(mockSandboxService.destroySandbox).toHaveBeenCalledWith(
        'exec-1',
        'tenant-1',
      );
      expect(
        mockSandboxService.destroyConversationSandbox,
      ).not.toHaveBeenCalled();
    });

    it('should not call either destroy when no binding IDs present', async () => {
      const session = makeFakeSession();

      await provider.destroy({
        sessionId: session.id,
        session,
        tenantId: 'tenant-1',
      });

      expect(mockSandboxService.destroySandbox).not.toHaveBeenCalled();
      expect(
        mockSandboxService.destroyConversationSandbox,
      ).not.toHaveBeenCalled();
    });
  });

  describe('share', () => {
    it('should not throw', async () => {
      const session = makeFakeSession();

      await expect(
        provider.share(
          { sessionId: session.id, session, tenantId: 'tenant-1' },
          'consumer-1',
        ),
      ).resolves.toBeUndefined();
    });
  });
});
