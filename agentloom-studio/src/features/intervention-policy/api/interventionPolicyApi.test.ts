import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createInterventionPolicy,
  deleteInterventionPolicy,
  fetchInterventionPolicies,
  fetchResolvedInterventionPolicy,
  updateInterventionPolicy,
} from './interventionPolicyApi'

const { getMock, postMock, patchMock, deleteMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
  toSnakeBodyMock: vi.fn((body: unknown) => body),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    patch: patchMock,
    delete: deleteMock,
  },
  toSnakeBody: toSnakeBodyMock,
}))

describe('interventionPolicyApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('兼容原始数组形式的策略列表响应', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue([
        {
          id: 'policy-workflow',
          workflowId: 'wf-001',
          nodeId: null,
          allowedRoles: ['owner', 'admin'],
          timeoutSeconds: 86400,
          timeoutAction: 'reject',
          escalateToRole: null,
          notifyChannels: ['in_app'],
          version: 1,
        },
      ]),
    })

    await expect(fetchInterventionPolicies('wf-001')).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'policy-workflow',
          timeoutSeconds: 86400,
        }),
      ],
    })

    expect(getMock).toHaveBeenCalledWith('workflow-definitions/wf-001/intervention-policies')
  })

  it('兼容分页形式的策略列表响应', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'policy-node',
            workflowId: 'wf-001',
            nodeId: 'node-agent-1',
            allowedRoles: ['creator'],
            timeoutSeconds: 3600,
            timeoutAction: 'approve',
            escalateToRole: null,
            notifyChannels: ['in_app', 'email'],
            version: 2,
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      }),
    })

    await expect(fetchInterventionPolicies('wf-001')).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'policy-node',
          nodeId: 'node-agent-1',
        }),
      ],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    })
  })

  it('读取 resolved 响应时兼容 ApiResponse 包装并透传 nodeId 查询参数', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          allowedRoles: ['owner', 'admin'],
          timeoutSeconds: 604800,
          timeoutAction: 'escalate',
          escalateToRole: 'owner',
          notifyChannels: ['in_app', 'push'],
          source: 'node',
        },
      }),
    })

    await expect(
      fetchResolvedInterventionPolicy('wf-001', 'node-agent-2'),
    ).resolves.toEqual({
      allowedRoles: ['owner', 'admin'],
      timeoutSeconds: 604800,
      timeoutAction: 'escalate',
      escalateToRole: 'owner',
      notifyChannels: ['in_app', 'push'],
        source: 'node',
    })

    expect(getMock).toHaveBeenCalledWith(
      'workflow-definitions/wf-001/intervention-policies/resolve',
      {
        searchParams: {
          nodeId: 'node-agent-2',
        },
      },
    )
  })

  it('创建策略时应先做 snake_case 转换并返回解包后的数据', async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'policy-created',
          workflowId: 'wf-001',
          nodeId: null,
          allowedRoles: ['owner', 'admin'],
          timeoutSeconds: 86400,
          timeoutAction: 'reject',
          escalateToRole: null,
          notifyChannels: ['in_app'],
          version: 1,
        },
      }),
    })

    await expect(
      createInterventionPolicy('wf-001', {
        nodeId: null,
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 86400,
        timeoutAction: 'reject',
        escalateToRole: null,
        notifyChannels: ['in_app'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'policy-created',
        timeoutAction: 'reject',
      }),
    )

    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      nodeId: null,
      allowedRoles: ['owner', 'admin'],
      timeoutSeconds: 86400,
      timeoutAction: 'reject',
      escalateToRole: null,
      notifyChannels: ['in_app'],
    })
    expect(postMock).toHaveBeenCalledWith('workflow-definitions/wf-001/intervention-policies', {
      json: expect.objectContaining({ timeoutSeconds: 86400 }),
    })
  })

  it('更新与删除策略时使用正确端点', async () => {
    patchMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'policy-workflow',
          workflowId: 'wf-001',
          nodeId: null,
          allowedRoles: ['owner'],
          timeoutSeconds: 3600,
          timeoutAction: 'approve',
          escalateToRole: null,
          notifyChannels: ['in_app'],
          version: 3,
        },
      }),
    })
    deleteMock.mockResolvedValue(undefined)

    await expect(
      updateInterventionPolicy('wf-001', 'policy-workflow', {
        nodeId: null,
        allowedRoles: ['owner'],
        timeoutSeconds: 3600,
        timeoutAction: 'approve',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        version: 3,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'policy-workflow',
        timeoutAction: 'approve',
      }),
    )

    await expect(
      deleteInterventionPolicy('wf-001', 'policy-workflow'),
    ).resolves.toBeUndefined()

    expect(patchMock).toHaveBeenCalledWith(
      'workflow-definitions/wf-001/intervention-policies/policy-workflow',
      {
        json: expect.objectContaining({ timeoutAction: 'approve', version: 3 }),
      },
    )
    expect(deleteMock).toHaveBeenCalledWith(
      'workflow-definitions/wf-001/intervention-policies/policy-workflow',
    )
  })
})
