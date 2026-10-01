import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClientModule from '@/shared/api/client'

/**
 * /reusable-blocks 的 DTO（`CreateReusableBlockSchema` / `UpdateReusableBlockSchema`）
 * 字段全是 camelCase，端口与 metadata 声明了 `.strict()`；节点 data 原样入库，
 * 执行期按 `data.nodeType` 识别节点。请求体必须原样发送，不能套 `toSnakeBody()`。
 */
const { postMock, patchMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  patchMock: vi.fn(),
}))

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>()
  return {
    ...actual,
    apiClient: { post: postMock, patch: patchMock },
  }
})

import { createBlock, updateBlock } from './blockApi'

const definition = {
  nodes: [{ id: 'n1', data: { nodeType: 'input-preprocessor', transformType: 'script' } }],
  edges: [],
  inputPorts: [
    { id: 'p-in', label: '文本', dataType: 'text' as const, sourceNodeId: 'n1', sourcePortId: 'text-in' },
  ],
  outputPorts: [],
}

describe('blockApi 请求体', () => {
  beforeEach(() => {
    const response = { json: () => Promise.resolve({ data: { id: 'block-1' } }) }
    postMock.mockReset().mockReturnValue(response)
    patchMock.mockReset().mockReturnValue(response)
  })

  it('createBlock 按 DTO 原样发送 camelCase，不改写节点 data 与端口映射', async () => {
    await createBlock({
      name: '块',
      tags: [],
      definition,
      metadata: { nodeCount: 1, version: 1 },
    })

    expect(postMock).toHaveBeenCalledWith('reusable-blocks', {
      json: {
        name: '块',
        tags: [],
        definition,
        metadata: { nodeCount: 1, version: 1 },
      },
    })
  })

  it('updateBlock 同样发送 camelCase（isPublished 不能变成 is_published）', async () => {
    await updateBlock('block-1', { isPublished: true, version: 2 })

    expect(patchMock).toHaveBeenCalledWith('reusable-blocks/block-1', {
      json: { isPublished: true, version: 2 },
    })
  })
})
