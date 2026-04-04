import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createWorkflow, listWorkflows, validateImport } from './workflowApi'

const { getMock, postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((body: unknown) => body),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
  toSnakeBody: toSnakeBodyMock,
}))

describe('createWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应向 workflow-definitions 发送 POST 请求并返回 data', async () => {
    const mockWorkflow = { id: 'wf-1', name: '测试工作流', slug: 'test-workflow' }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: mockWorkflow }),
    })

    await expect(
      createWorkflow({
        name: '测试工作流',
        description: '描述',
        templateSlug: 'test-template',
      }),
    ).resolves.toEqual(mockWorkflow)

    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      name: '测试工作流',
      description: '描述',
      templateSlug: 'test-template',
    })
    expect(postMock).toHaveBeenCalledWith('workflow-definitions', {
      json: expect.objectContaining({ name: '测试工作流' }),
    })
  })

  it('请求失败时应透传错误', async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error('Network error')),
    })

    await expect(createWorkflow({ name: '失败测试' })).rejects.toThrow(
      'Network error',
    )
  })

  it('应透传 shareToken 以支持通过分享链接克隆', async () => {
    const mockWorkflow = { id: 'wf-2', name: '分享副本', slug: 'shared-copy' }
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: mockWorkflow }),
    })

    await expect(
      createWorkflow({
        name: '分享副本',
        shareToken: 'share-token-123',
      }),
    ).resolves.toEqual(mockWorkflow)

    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      name: '分享副本',
      shareToken: 'share-token-123',
    })
  })
})

describe('validateImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应直接提交原始导出 envelope，而不是包裹 fileContent', async () => {
    const validationResult = {
      valid: true,
      errors: [],
      nodeCount: 2,
      edgeCount: 1,
    }
    const rawEnvelope = {
      schema_version: 'agentloom-workflow-v1',
      exported_at: '2026-03-16T00:00:00.000Z',
      workflow: {
        name: '导入测试工作流',
        description: '导入描述',
        definition: {
          nodes: [{ id: 'n1' }, { id: 'n2' }],
          edges: [{ id: 'e1' }],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        input_schema: null,
      },
    }

    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(validationResult),
    })

    await expect(validateImport(rawEnvelope)).resolves.toEqual(validationResult)

    expect(toSnakeBodyMock).toHaveBeenCalledWith(rawEnvelope)
    expect(postMock).toHaveBeenCalledWith('workflow-definitions/import/validate', {
      json: rawEnvelope,
    })
  })
})

describe('listWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应透传 sourceKind 查询参数', async () => {
    const response = {
      data: [
        { id: 'wf-1', name: '分享导入工作流', slug: 'shared-workflow', resourceSourceKind: 'share_imported' },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    await expect(
      listWorkflows({
        page: 1,
        pageSize: 20,
        sourceKind: 'share_imported',
      }),
    ).resolves.toEqual(response)

    expect(getMock).toHaveBeenCalledWith('workflow-definitions', {
      searchParams: {
        page: '1',
        pageSize: '20',
        sourceKind: 'share_imported',
      },
    })
  })
})
