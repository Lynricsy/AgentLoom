import { describe, expect, it } from 'vitest';

import { sanitizeDefinition } from './sanitize-export.utils';

describe('sanitizeDefinition', () => {
  it('应移除节点与边数据中的敏感配置键', () => {
    const definition: Parameters<typeof sanitizeDefinition>[0] = {
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          position: { x: 10, y: 20 },
          data: {
            apiKey: 'secret-api-key',
            api_key: 'secret-api-key-snake',
            secretKey: 'secret-key',
            secret_key: 'secret-key-snake',
            accessToken: 'access-token',
            access_token: 'access-token-snake',
            refreshToken: 'refresh-token',
            refresh_token: 'refresh-token-snake',
            password: 'password',
            credentials: { username: 'root' },
            connectionString: 'postgres://local',
            connection_string: 'postgres://snake',
            safe: 'kept',
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'node-1',
          target: 'node-2',
          data: {
            password: 'remove-me',
            connection_string: 'remove-me-too',
            label: '保留字段',
          },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const sanitized = sanitizeDefinition(definition);

    expect(sanitized.nodes[0].data).toEqual({ safe: 'kept' });
    expect(sanitized.edges[0].data).toEqual({ label: '保留字段' });
    expect(definition.nodes[0].data).toMatchObject({
      apiKey: 'secret-api-key',
      safe: 'kept',
    });
  });

  it('应移除租户与用户上下文相关键', () => {
    const definition: Parameters<typeof sanitizeDefinition>[0] = {
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            tenantId: 'tenant-1',
            tenant_id: 'tenant-1',
            organizationId: 'org-1',
            organization_id: 'org-1',
            orgId: 'org-1',
            org_id: 'org-1',
            userId: 'user-1',
            user_id: 'user-1',
            createdBy: 'user-1',
            created_by: 'user-1',
            updatedBy: 'user-2',
            updated_by: 'user-2',
            name: '保留字段',
          },
        },
      ],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 1 },
    };

    const sanitized = sanitizeDefinition(definition);

    expect(sanitized.nodes[0].data).toEqual({ name: '保留字段' });
  });

  it('应仅在 mcpConfig 下剥离 MCP 敏感字段，并递归处理深层对象与数组', () => {
    const definition: Parameters<typeof sanitizeDefinition>[0] = {
      nodes: [
        {
          id: 'node-1',
          type: 'tool',
          position: { x: 10, y: 30 },
          data: {
            mcpConfig: {
              apiKey: 'remove-api-key',
              api_key: 'remove-api-key-snake',
              env: {
                ACCESS_TOKEN: 'remove-env-token',
              },
              nested: {
                env: 'keep-because-parent-is-nested',
                tenant_id: 'remove-tenant-id',
                tools: [
                  {
                    credentials: 'remove-credentials',
                    name: 'tool-a',
                  },
                  {
                    mcpConfig: {
                      env: {
                        INNER: 'remove-inner-env',
                      },
                      safe: true,
                    },
                  },
                ],
              },
              safe: 'keep-safe',
            },
            otherConfig: {
              env: {
                KEEP_ME: true,
              },
            },
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const sanitized = sanitizeDefinition(definition);

    expect(sanitized.nodes[0].data).toEqual({
      mcpConfig: {
        nested: {
          env: 'keep-because-parent-is-nested',
          tools: [
            {
              name: 'tool-a',
            },
            {
              mcpConfig: {
                safe: true,
              },
            },
          ],
        },
        safe: 'keep-safe',
      },
      otherConfig: {
        env: {
          KEEP_ME: true,
        },
      },
    });
  });

  it('应保留 null/undefined，并清洗数组中的对象元素', () => {
    const definition: Parameters<typeof sanitizeDefinition>[0] = {
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          position: { x: 5, y: 6 },
          data: {
            nullable: null,
            optionalValue: undefined,
            list: [
              null,
              undefined,
              {
                password: 'remove-me',
                visible: true,
              },
            ],
          },
        },
      ],
      edges: [],
      viewport: { x: 7, y: 8, zoom: 1.25 },
    };

    const sanitized = sanitizeDefinition(definition);

    expect(sanitized.nodes[0].data).toEqual({
      nullable: null,
      optionalValue: undefined,
      list: [null, undefined, { visible: true }],
    });
  });

  it('应保持 viewport 原样返回，不对其做敏感字段清洗', () => {
    const viewport = {
      x: 0,
      y: 0,
      zoom: 1,
      secretKey: 'should-stay',
      tenant_id: 'also-stays',
    };
    const definition = {
      nodes: [],
      edges: [],
      viewport,
    } as Parameters<typeof sanitizeDefinition>[0];

    const sanitized = sanitizeDefinition(definition);

    expect(sanitized.viewport).toBe(viewport);
    expect(sanitized.viewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
      secretKey: 'should-stay',
      tenant_id: 'also-stays',
    });
  });
});
