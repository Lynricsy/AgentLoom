import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { WorkflowNotFoundException } from '../../workflow-definition/workflow-version.exceptions';
import { InterventionPolicyController } from '../intervention-policy.controller';
import { InterventionPolicyService } from '../intervention-policy.service';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const NODE_ID = 'agent-node-1';

const mockInterventionPolicyService = {
  findAll: vi.fn(),
  resolvePolicy: vi.fn(),
  assertWorkflowExists: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

describe('InterventionPolicyController', () => {
  let controller: InterventionPolicyController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [InterventionPolicyController],
      providers: [
        {
          provide: InterventionPolicyService,
          useValue: mockInterventionPolicyService,
        },
      ],
    }).compile();

    controller = moduleRef.get(InterventionPolicyController);
  });

  it('应返回扁平 resolved policy 数据', async () => {
    const resolvedPolicy = {
      allowedRoles: ['owner', 'admin'],
      timeoutSeconds: 900,
      timeoutAction: 'escalate',
      escalateToRole: 'owner',
      notifyChannels: ['in_app', 'push'],
      source: 'node' as const,
    };
    mockInterventionPolicyService.resolvePolicy.mockResolvedValue(
      resolvedPolicy,
    );

    await expect(
      controller.resolvePolicy(TENANT_ID, WORKFLOW_ID, NODE_ID),
    ).resolves.toEqual({
      data: resolvedPolicy,
    });

    expect(mockInterventionPolicyService.resolvePolicy).toHaveBeenCalledWith(
      TENANT_ID,
      WORKFLOW_ID,
      NODE_ID,
    );
  });

  it('resolve 在工作流不存在或属于他租户时 404，不返回系统默认策略', async () => {
    const notFound = new WorkflowNotFoundException(WORKFLOW_ID);
    mockInterventionPolicyService.assertWorkflowExists.mockRejectedValueOnce(
      notFound,
    );

    await expect(
      controller.resolvePolicy(TENANT_ID, WORKFLOW_ID, NODE_ID),
    ).rejects.toBe(notFound);
    expect(
      mockInterventionPolicyService.assertWorkflowExists,
    ).toHaveBeenCalledWith(TENANT_ID, WORKFLOW_ID);
    expect(mockInterventionPolicyService.resolvePolicy).not.toHaveBeenCalled();
  });
});
