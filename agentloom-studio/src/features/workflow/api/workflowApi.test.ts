import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createWorkflow } from './workflowApi'

const { postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((body: unknown) => body),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
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
})
