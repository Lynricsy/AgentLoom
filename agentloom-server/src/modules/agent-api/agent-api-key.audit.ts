import type { AuditLogHttpCaptureConfig } from '../evidence/audit-log.capture';

/** 管理接口的审计配置；创建记录里刻意剔除明文 key */
export const agentApiKeyAuditConfigs = {
  create: {
    eventType: 'agent-api-key.created',
    buildRecord: ({ request, response }) => {
      const tenantId = request.user?.tenantId;
      const actorId = request.user?.sub;
      const data = (response as { data?: Record<string, unknown> } | undefined)
        ?.data;

      if (!tenantId || !actorId || !data || typeof data.id !== 'string') {
        return null;
      }

      const { key: _secret, ...after } = data;

      return {
        tenantId,
        actorId,
        actorType: 'user',
        eventType: 'agent-api-key.created',
        resourceType: 'agent_api_key',
        resourceId: data.id,
        summary: 'Agent API key created',
        after,
        metadata: { agentDefinitionId: request.params?.agentId ?? null },
      };
    },
  },
  revoke: {
    eventType: 'agent-api-key.revoked',
    buildRecord: ({ request }) => {
      const tenantId = request.user?.tenantId;
      const actorId = request.user?.sub;
      const keyId = request.params?.keyId;

      if (!tenantId || !actorId || !keyId) {
        return null;
      }

      return {
        tenantId,
        actorId,
        actorType: 'user',
        eventType: 'agent-api-key.revoked',
        resourceType: 'agent_api_key',
        resourceId: keyId,
        summary: 'Agent API key revoked',
        metadata: { agentDefinitionId: request.params?.agentId ?? null },
      };
    },
  },
} satisfies Record<string, AuditLogHttpCaptureConfig>;
