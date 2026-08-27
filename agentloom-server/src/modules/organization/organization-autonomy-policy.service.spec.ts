import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrganizationAutonomyPolicyService,
  SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY,
  resolveRawAutonomyMode,
} from './organization-autonomy-policy.service';
import type { AuditLogService } from '../evidence/audit-log.service';
import {
  InsufficientOrganizationPermissionException,
  OrganizationNotFoundException,
} from './organization.exceptions';

const ORG_ID = '019577a0-0000-7000-8000-000000000301';
const OWNER_ID = '019577a0-0000-7000-8000-000000000302';
const VIEWER_ID = '019577a0-0000-7000-8000-000000000303';
const TENANT_ID = '019577a0-0000-7000-8000-000000000304';
const NOW = new Date('2026-03-18T00:00:00.000Z');

function createInsertChain(result: unknown[] = []) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

function makeOrganization(
  overrides: Partial<{
    id: string;
    tenantId: string;
  }> = {},
) {
  return {
    id: ORG_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function makeMembership(
  overrides: Partial<{
    organizationId: string;
    userId: string;
    role: 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';
  }> = {},
) {
  return {
    organizationId: ORG_ID,
    userId: OWNER_ID,
    role: 'owner' as const,
    ...overrides,
  };
}

function makePolicy(
  overrides: Partial<{
    id: string;
    organizationId: string;
    tenantId: string;
    autonomyCap: 'MANUAL_CONFIRM' | 'RULE_BASED' | 'LLM_SUGGEST';
    version: number;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000000305',
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    autonomyCap: 'RULE_BASED' as const,
    version: 1,
    createdBy: OWNER_ID,
    updatedBy: OWNER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeWorkflowDefinition(
  overrides: Partial<{
    id: string;
    name: string;
    tenantId: string;
    nodes: Array<{
      id: string;
      type?: string;
      data: Record<string, unknown>;
    }>;
  }> = {},
) {
  return {
    id: '019577a0-0000-7000-8000-000000000401',
    name: 'Demo workflow',
    tenantId: TENANT_ID,
    nodes: [],
    ...overrides,
  };
}

describe('OrganizationAutonomyPolicyService', () => {
  let service: OrganizationAutonomyPolicyService;
  let db: {
    query: {
      organizations: { findFirst: ReturnType<typeof vi.fn> };
      organizationMembers: { findFirst: ReturnType<typeof vi.fn> };
      organizationAutonomyPolicies: { findFirst: ReturnType<typeof vi.fn> };
      optimizationSuggestions: { findMany: ReturnType<typeof vi.fn> };
    };
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  let auditLogService: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = {
      query: {
        organizations: { findFirst: vi.fn() },
        organizationMembers: { findFirst: vi.fn() },
        organizationAutonomyPolicies: { findFirst: vi.fn() },
        optimizationSuggestions: { findMany: vi.fn().mockResolvedValue([]) },
      },
      select: vi.fn().mockReturnValue(createSelectChain([])),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };

    db.transaction.mockImplementation(
      async (callback: (tx: typeof db) => unknown) => callback(db),
    );

    auditLogService = {
      record: vi.fn().mockResolvedValue(null),
    };

    service = new OrganizationAutonomyPolicyService(
      db as unknown as ConstructorParameters<
        typeof OrganizationAutonomyPolicyService
      >[0],
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('resolveEffectiveAutonomyMode', () => {
    it.each([
      [
        {
          autonomyMode: 'MANUAL_CONFIRM',
          autonomyConfig: { mode: 'RULE_BASED' },
          settings: { autonomyMode: 'LLM_SUGGEST' },
          config: { autonomyMode: 'FULL_AUTO' },
        },
        'MANUAL_CONFIRM',
      ],
      [
        {
          autonomyConfig: { mode: 'RULE_BASED' },
          settings: { autonomyMode: 'LLM_SUGGEST' },
          config: { autonomyMode: 'FULL_AUTO' },
        },
        'RULE_BASED',
      ],
      [
        {
          settings: { autonomyMode: 'LLM_SUGGEST' },
          config: { autonomyMode: 'FULL_AUTO' },
        },
        'LLM_SUGGEST',
      ],
      [{ config: { autonomyMode: 'FULL_AUTO' } }, 'LLM_SUGGEST'],
      [{}, 'LLM_SUGGEST'],
    ])('按四级优先级解析有效 autonomy mode %#', async (nodeData, expected) => {
      vi.spyOn(service, 'resolveAutonomyCapForTenant').mockResolvedValue(
        'LLM_SUGGEST',
      );

      await expect(
        service.resolveEffectiveAutonomyMode(TENANT_ID, nodeData),
      ).resolves.toBe(expected);
    });

    it('原始配置缺失时回退 FULL_AUTO', () => {
      expect(resolveRawAutonomyMode({})).toBe('FULL_AUTO');
    });

    it('按租户 autonomy cap clamp 节点配置', async () => {
      vi.spyOn(service, 'resolveAutonomyCapForTenant').mockResolvedValue(
        'RULE_BASED',
      );

      await expect(
        service.resolveEffectiveAutonomyMode(TENANT_ID, {
          autonomyMode: 'FULL_AUTO',
        }),
      ).resolves.toBe('RULE_BASED');
    });
  });

  describe('getAutonomyPolicy', () => {
    it('returns the system default policy when the organization has no stored row', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(null);

      await expect(
        service.getAutonomyPolicy(ORG_ID, OWNER_ID),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        autonomyCap: SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap,
        version: 0,
        violationSummary: {
          workflowCount: 0,
          nodeCount: 0,
        },
      });
    });

    it('throws when the target organization does not exist', async () => {
      db.query.organizations.findFirst.mockResolvedValue(null);

      await expect(
        service.getAutonomyPolicy(ORG_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);
    });

    it('rejects non-owner access even if the user is still a member', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership({
          userId: VIEWER_ID,
          role: 'viewer',
        }),
      );

      await expect(
        service.getAutonomyPolicy(ORG_ID, VIEWER_ID),
      ).rejects.toBeInstanceOf(InsufficientOrganizationPermissionException);
    });

    it('calculates a real violation summary by scanning current workflow definitions with optimization-compatible precedence', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ autonomyCap: 'RULE_BASED' }),
      );
      db.select.mockReturnValue(
        createSelectChain([
          makeWorkflowDefinition({
            id: 'wf-1',
            nodes: [
              {
                id: 'agent-1',
                type: 'llm-agent',
                data: {
                  autonomyMode: 'FULL_AUTO',
                  autonomyConfig: { mode: 'MANUAL_CONFIRM' },
                },
              },
              {
                id: 'agent-2',
                type: 'llm-agent',
                data: {
                  autonomyConfig: { mode: 'LLM_SUGGEST' },
                },
              },
              {
                id: 'tool-1',
                type: 'tool',
                data: {
                  autonomyMode: 'FULL_AUTO',
                },
              },
            ],
          }),
          makeWorkflowDefinition({
            id: 'wf-2',
            nodes: [
              {
                id: 'agent-3',
                type: 'agent',
                data: {
                  settings: { autonomyMode: 'LLM_SUGGEST' },
                },
              },
              {
                id: 'agent-4',
                type: 'agent',
                data: {
                  config: { autonomyMode: 'RULE_BASED' },
                },
              },
            ],
          }),
        ]),
      );

      await expect(
        service.getAutonomyPolicy(ORG_ID, OWNER_ID),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          autonomyCap: 'RULE_BASED',
          version: 1,
          updatedBy: OWNER_ID,
          violationSummary: {
            workflowCount: 2,
            nodeCount: 3,
          },
        }),
      );
    });
  });

  describe('updateAutonomyPolicy', () => {
    it('inserts a new stored policy row when none exists', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue(
        createInsertChain([
          makePolicy({
            autonomyCap: 'RULE_BASED',
          }),
        ]),
      );

      await expect(
        service.updateAutonomyPolicy(
          ORG_ID,
          {
            autonomyCap: 'RULE_BASED',
          },
          OWNER_ID,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          autonomyCap: 'RULE_BASED',
          version: 1,
          updatedBy: OWNER_ID,
          violationSummary: {
            workflowCount: 0,
            nodeCount: 0,
          },
        }),
      );

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.update).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'organization.autonomy-policy.updated',
          resourceId: ORG_ID,
          actorId: OWNER_ID,
        }),
      );
    });

    it('updates the existing stored policy row when one already exists', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ version: 2, autonomyCap: 'RULE_BASED' }),
      );
      db.update.mockReturnValue(
        createUpdateChain([
          makePolicy({
            autonomyCap: 'MANUAL_CONFIRM',
            version: 3,
          }),
        ]),
      );

      await expect(
        service.updateAutonomyPolicy(
          ORG_ID,
          {
            autonomyCap: 'MANUAL_CONFIRM',
          },
          OWNER_ID,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          autonomyCap: 'MANUAL_CONFIRM',
          version: 3,
          updatedBy: OWNER_ID,
          violationSummary: {
            workflowCount: 0,
            nodeCount: 0,
          },
        }),
      );

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'organization.autonomy-policy.updated',
          resourceId: ORG_ID,
          actorId: OWNER_ID,
          before: expect.objectContaining({
            autonomyCap: 'RULE_BASED',
            version: 2,
          }),
          after: expect.objectContaining({
            autonomyCap: 'MANUAL_CONFIRM',
            version: 3,
          }),
        }),
      );
    });

    it('recalculates the violation summary using the updated autonomy cap', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ autonomyCap: 'RULE_BASED', version: 2 }),
      );
      db.select.mockReturnValue(
        createSelectChain([
          makeWorkflowDefinition({
            id: 'wf-3',
            nodes: [
              {
                id: 'agent-5',
                type: 'llm-agent',
                data: {
                  autonomyMode: 'RULE_BASED',
                },
              },
              {
                id: 'agent-6',
                type: 'llm-agent',
                data: {
                  config: { autonomyMode: 'LLM_SUGGEST' },
                },
              },
            ],
          }),
        ]),
      );
      db.update.mockReturnValue(
        createUpdateChain([
          makePolicy({
            autonomyCap: 'MANUAL_CONFIRM',
            version: 3,
          }),
        ]),
      );

      await expect(
        service.updateAutonomyPolicy(
          ORG_ID,
          {
            autonomyCap: 'MANUAL_CONFIRM',
          },
          OWNER_ID,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          autonomyCap: 'MANUAL_CONFIRM',
          version: 3,
          violationSummary: {
            workflowCount: 1,
            nodeCount: 2,
          },
        }),
      );
    });

    it('blocks pending autonomy_upgrade suggestions that exceed a tightened cap', async () => {
      const updatedPolicy = makePolicy({
        autonomyCap: 'RULE_BASED',
        version: 2,
      });
      const blockedSuggestionUpdate = createUpdateChain([
        {
          id: '019577a0-0000-7000-8000-000000000777',
          status: 'blocked',
          analysisMetadata: {
            analyzerVersion: 'optimization-analysis-v1',
            totalRecords: 64,
            policyBlock: {
              autonomyCap: 'RULE_BASED',
              reasonCode: 'mode_exceeds_cap',
            },
          },
        },
      ]);

      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ autonomyCap: 'LLM_SUGGEST', version: 1 }),
      );
      db.query.optimizationSuggestions.findMany.mockResolvedValue([
        {
          id: '019577a0-0000-7000-8000-000000000777',
          tenantId: TENANT_ID,
          workflowDefinitionId: 'wf-1',
          nodeId: 'agent-1',
          suggestionType: 'autonomy_upgrade',
          status: 'pending',
          suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
          analysisMetadata: {
            analyzerVersion: 'optimization-analysis-v1',
            totalRecords: 64,
          },
        },
        {
          id: '019577a0-0000-7000-8000-000000000778',
          tenantId: TENANT_ID,
          workflowDefinitionId: 'wf-1',
          nodeId: 'agent-2',
          suggestionType: 'autonomy_upgrade',
          status: 'pending',
          suggestedValue: { autonomyMode: 'RULE_BASED' },
          analysisMetadata: {
            analyzerVersion: 'optimization-analysis-v1',
            totalRecords: 32,
          },
        },
      ]);
      db.update
        .mockReturnValueOnce(createUpdateChain([updatedPolicy]))
        .mockReturnValueOnce(blockedSuggestionUpdate);

      await service.updateAutonomyPolicy(
        ORG_ID,
        {
          autonomyCap: 'RULE_BASED',
        },
        OWNER_ID,
      );

      expect(db.query.optimizationSuggestions.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(blockedSuggestionUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'blocked',
          analysisMetadata: expect.objectContaining({
            policyBlock: expect.objectContaining({
              autonomyCap: 'RULE_BASED',
              reasonCode: 'mode_exceeds_cap',
            }),
          }),
        }),
      );
    });
  });

  describe('inspectWorkflowNodesAgainstPolicy', () => {
    it('inspects workflow nodes with the same precedence and legacy compatibility used by policy scanning', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ autonomyCap: 'RULE_BASED' }),
      );

      await expect(
        service.inspectWorkflowNodesAgainstPolicy({
          tenantId: TENANT_ID,
          workflowId: 'wf-publish',
          workflowName: 'Publish workflow',
          nodes: [
            {
              id: 'agent-1',
              type: 'llm-agent',
              position: { x: 0, y: 0 },
              data: {
                label: 'Planner',
                autonomyMode: 'FULL_AUTO',
                autonomyConfig: { mode: 'MANUAL_CONFIRM' },
              },
            },
            {
              id: 'agent-2',
              type: 'agent',
              position: { x: 120, y: 0 },
              data: {
                title: 'Reviewer',
                settings: { autonomyMode: 'LLM_SUGGEST' },
              },
            },
            {
              id: 'agent-3',
              type: 'agent',
              position: { x: 240, y: 0 },
              data: {
                config: { autonomyMode: 'RULE_BASED' },
              },
            },
            {
              id: 'tool-1',
              type: 'tool',
              position: { x: 360, y: 0 },
              data: {
                autonomyMode: 'FULL_AUTO',
              },
            },
          ],
        }),
      ).resolves.toEqual({
        autonomyCap: 'RULE_BASED',
        violations: [
          expect.objectContaining({
            workflowId: 'wf-publish',
            workflowName: 'Publish workflow',
            nodeId: 'agent-1',
            nodeName: 'Planner',
            rawMode: 'FULL_AUTO',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'RULE_BASED',
            source: 'legacy',
          }),
          expect.objectContaining({
            workflowId: 'wf-publish',
            workflowName: 'Publish workflow',
            nodeId: 'agent-2',
            nodeName: 'Reviewer',
            rawMode: 'LLM_SUGGEST',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'RULE_BASED',
            source: 'canonical',
          }),
        ],
      });
    });

    it('falls back to the system default cap when no organization policy exists for the tenant', async () => {
      db.query.organizations.findFirst.mockResolvedValue(null);

      await expect(
        service.inspectWorkflowNodesAgainstPolicy({
          tenantId: TENANT_ID,
          workflowId: 'wf-default',
          workflowName: 'Default workflow',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {
                autonomyConfig: { mode: 'LLM_SUGGEST' },
              },
            },
          ],
        }),
      ).resolves.toEqual({
        autonomyCap: SYSTEM_DEFAULT_ORGANIZATION_AUTONOMY_POLICY.autonomyCap,
        violations: [],
      });
    });
  });

  describe('previewAutonomyDowngrade', () => {
    it('returns downgrade details and records a preview audit event', async () => {
      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.select.mockReturnValue(
        createSelectChain([
          makeWorkflowDefinition({
            id: 'wf-preview-1',
            name: 'Preview workflow',
            nodes: [
              {
                id: 'agent-1',
                type: 'llm-agent',
                data: {
                  label: 'Planner',
                  autonomyMode: 'FULL_AUTO',
                  autonomyConfig: { mode: 'MANUAL_CONFIRM' },
                },
              },
              {
                id: 'agent-2',
                type: 'agent',
                data: {
                  name: 'Reviewer',
                  autonomyConfig: { mode: 'LLM_SUGGEST' },
                },
              },
              {
                id: 'tool-1',
                type: 'tool',
                data: {
                  autonomyMode: 'FULL_AUTO',
                },
              },
            ],
          }),
        ]),
      );

      await expect(
        service.previewAutonomyDowngrade(
          ORG_ID,
          { autonomyCap: 'RULE_BASED' },
          OWNER_ID,
        ),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        autonomyCap: 'RULE_BASED',
        violationSummary: {
          workflowCount: 1,
          nodeCount: 2,
        },
        violations: [
          {
            workflowId: 'wf-preview-1',
            workflowName: 'Preview workflow',
            nodeId: 'agent-1',
            nodeName: 'Planner',
            rawMode: 'FULL_AUTO',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'RULE_BASED',
            source: 'legacy',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
          },
          {
            workflowId: 'wf-preview-1',
            workflowName: 'Preview workflow',
            nodeId: 'agent-2',
            nodeName: 'Reviewer',
            rawMode: 'LLM_SUGGEST',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'RULE_BASED',
            source: 'canonical',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
          },
        ],
      });

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: OWNER_ID,
          actorType: 'user',
          eventType: 'organization.autonomy-policy.previewed',
          resourceType: 'organization',
          resourceId: ORG_ID,
          summary: 'Organization autonomy downgrade preview generated',
          metadata: expect.objectContaining({
            autonomyCap: 'RULE_BASED',
            workflowCount: 1,
            nodeCount: 2,
          }),
        }),
      );
    });
  });

  describe('confirmAutonomyDowngrade', () => {
    it('updates the policy, downgrades current workflow definitions, and records confirm/completed audit events', async () => {
      const storedPolicy = makePolicy({
        autonomyCap: 'RULE_BASED',
        version: 2,
      });
      const updatedPolicy = makePolicy({
        autonomyCap: 'MANUAL_CONFIRM',
        version: 3,
      });
      const policyUpdateChain = createUpdateChain([updatedPolicy]);
      const workflowUpdateChain = createUpdateChain([
        makeWorkflowDefinition({
          id: 'wf-confirm-1',
          name: 'Confirm workflow',
        }),
      ]);

      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        storedPolicy,
      );
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            makeWorkflowDefinition({
              id: 'wf-confirm-1',
              name: 'Confirm workflow',
              nodes: [
                {
                  id: 'agent-1',
                  type: 'llm-agent',
                  data: {
                    label: 'Planner',
                    autonomyMode: 'FULL_AUTO',
                    autonomyConfig: {
                      mode: 'RULE_BASED',
                      confirmationThreshold: 0.6,
                    },
                    settings: {
                      autonomyMode: 'RULE_BASED',
                      theme: 'compact',
                    },
                    config: {
                      autonomyMode: 'RULE_BASED',
                      modelId: 'gpt-4o',
                    },
                  },
                },
                {
                  id: 'agent-2',
                  type: 'agent',
                  data: {
                    title: 'Reviewer',
                    autonomyConfig: {
                      mode: 'LLM_SUGGEST',
                      confirmationThreshold: 0.7,
                    },
                    settings: {
                      autonomyMode: 'RULE_BASED',
                      layout: 'advanced',
                    },
                    config: {
                      autonomyMode: 'RULE_BASED',
                      modelId: 'claude-3-7-sonnet',
                    },
                  },
                },
                {
                  id: 'agent-3',
                  type: 'agent',
                  data: {
                    autonomyConfig: {
                      mode: 'MANUAL_CONFIRM',
                      confirmationThreshold: 0.8,
                    },
                    settings: {
                      autonomyMode: 'MANUAL_CONFIRM',
                    },
                    config: {
                      autonomyMode: 'MANUAL_CONFIRM',
                    },
                  },
                },
              ],
            }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));
      db.update
        .mockReturnValueOnce(policyUpdateChain)
        .mockReturnValueOnce(workflowUpdateChain);

      await expect(
        service.confirmAutonomyDowngrade(
          ORG_ID,
          { autonomyCap: 'MANUAL_CONFIRM' },
          OWNER_ID,
        ),
      ).resolves.toEqual({
        organizationId: ORG_ID,
        autonomyCap: 'MANUAL_CONFIRM',
        downgradedSummary: {
          workflowCount: 1,
          nodeCount: 2,
        },
        downgradedViolations: [
          {
            workflowId: 'wf-confirm-1',
            workflowName: 'Confirm workflow',
            nodeId: 'agent-1',
            nodeName: 'Planner',
            rawMode: 'FULL_AUTO',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'MANUAL_CONFIRM',
            source: 'legacy',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 MANUAL_CONFIRM，应降级为 MANUAL_CONFIRM',
          },
          {
            workflowId: 'wf-confirm-1',
            workflowName: 'Confirm workflow',
            nodeId: 'agent-2',
            nodeName: 'Reviewer',
            rawMode: 'LLM_SUGGEST',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'MANUAL_CONFIRM',
            source: 'canonical',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 MANUAL_CONFIRM，应降级为 MANUAL_CONFIRM',
          },
        ],
        policy: expect.objectContaining({
          organizationId: ORG_ID,
          autonomyCap: 'MANUAL_CONFIRM',
          version: 3,
          updatedBy: OWNER_ID,
          violationSummary: {
            workflowCount: 0,
            nodeCount: 0,
          },
        }),
      });

      const workflowUpdatePayload = workflowUpdateChain.set.mock
        .calls[0]?.[0] as {
        nodes: Array<{ id: string; data: Record<string, unknown> }>;
      };

      expect(workflowUpdatePayload.nodes).toEqual([
        expect.objectContaining({
          id: 'agent-1',
          data: expect.objectContaining({
            autonomyMode: 'MANUAL_CONFIRM',
            autonomyConfig: expect.objectContaining({
              mode: 'MANUAL_CONFIRM',
              confirmationThreshold: 0.6,
            }),
            settings: expect.objectContaining({
              autonomyMode: 'MANUAL_CONFIRM',
              theme: 'compact',
            }),
            config: expect.objectContaining({
              autonomyMode: 'MANUAL_CONFIRM',
              modelId: 'gpt-4o',
            }),
          }),
        }),
        expect.objectContaining({
          id: 'agent-2',
          data: expect.objectContaining({
            autonomyMode: 'MANUAL_CONFIRM',
            autonomyConfig: expect.objectContaining({
              mode: 'MANUAL_CONFIRM',
              confirmationThreshold: 0.7,
            }),
            settings: expect.objectContaining({
              autonomyMode: 'MANUAL_CONFIRM',
              layout: 'advanced',
            }),
            config: expect.objectContaining({
              autonomyMode: 'MANUAL_CONFIRM',
              modelId: 'claude-3-7-sonnet',
            }),
          }),
        }),
        expect.objectContaining({
          id: 'agent-3',
          data: expect.objectContaining({
            autonomyConfig: expect.objectContaining({ mode: 'MANUAL_CONFIRM' }),
            settings: expect.objectContaining({
              autonomyMode: 'MANUAL_CONFIRM',
            }),
            config: expect.objectContaining({ autonomyMode: 'MANUAL_CONFIRM' }),
          }),
        }),
      ]);

      expect(auditLogService.record.mock.calls).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              eventType: 'organization.autonomy-policy.confirmed',
              resourceId: ORG_ID,
            }),
          ],
          [
            expect.objectContaining({
              eventType: 'organization.autonomy-policy.downgrade-completed',
              resourceId: ORG_ID,
              metadata: expect.objectContaining({
                autonomyCap: 'MANUAL_CONFIRM',
                workflowCount: 1,
                nodeCount: 2,
              }),
            }),
          ],
        ]),
      );
    });

    it('records a downgrade-failed audit event when workflow rewriting fails', async () => {
      const failure = new Error('workflow rewrite failed');
      const policyUpdateChain = createUpdateChain([
        makePolicy({ autonomyCap: 'MANUAL_CONFIRM', version: 3 }),
      ]);
      const workflowUpdateChain = {
        set: vi.fn(),
        where: vi.fn(),
        returning: vi.fn().mockRejectedValue(failure),
      };
      workflowUpdateChain.set.mockReturnValue(workflowUpdateChain);
      workflowUpdateChain.where.mockReturnValue(workflowUpdateChain);

      db.query.organizations.findFirst.mockResolvedValue(makeOrganization());
      db.query.organizationMembers.findFirst.mockResolvedValue(
        makeMembership(),
      );
      db.query.organizationAutonomyPolicies.findFirst.mockResolvedValue(
        makePolicy({ autonomyCap: 'RULE_BASED', version: 2 }),
      );
      db.select.mockReturnValue(
        createSelectChain([
          makeWorkflowDefinition({
            id: 'wf-confirm-fail',
            name: 'Failing workflow',
            nodes: [
              {
                id: 'agent-1',
                type: 'llm-agent',
                data: {
                  autonomyMode: 'FULL_AUTO',
                },
              },
            ],
          }),
        ]),
      );
      db.update
        .mockReturnValueOnce(policyUpdateChain)
        .mockReturnValueOnce(workflowUpdateChain);

      await expect(
        service.confirmAutonomyDowngrade(
          ORG_ID,
          { autonomyCap: 'MANUAL_CONFIRM' },
          OWNER_ID,
        ),
      ).rejects.toThrow('workflow rewrite failed');

      expect(auditLogService.record.mock.calls).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              eventType: 'organization.autonomy-policy.confirmed',
            }),
          ],
          [
            expect.objectContaining({
              eventType: 'organization.autonomy-policy.downgrade-failed',
              metadata: expect.objectContaining({
                autonomyCap: 'MANUAL_CONFIRM',
                workflowCount: 1,
                nodeCount: 1,
                errorMessage: 'workflow rewrite failed',
              }),
            }),
          ],
        ]),
      );
    });
  });
});
