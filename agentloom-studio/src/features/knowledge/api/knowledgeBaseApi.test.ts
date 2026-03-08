import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeBase, KnowledgeBaseDocument } from '../types'
import {
  createKnowledgeBase,
  deleteDocument,
  deleteKnowledgeBase,
  fetchDocuments,
  fetchKnowledgeBase,
  fetchKnowledgeBases,
  uploadDocument,
} from './knowledgeBaseApi'

const { getMock, postMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    delete: deleteMock,
  },
  toSnakeBody: (input: unknown) => input,
}))

const mockKnowledgeBase: KnowledgeBase = {
  id: 'kb-1',
  tenantId: 'tenant-1',
  name: 'Test KB',
  description: 'Test knowledge base',
  visibility: 'private',
  createdBy: 'user-1',
  documentCount: 0,
  chunkCount: 0,
  status: 'empty',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const mockDocument: KnowledgeBaseDocument = {
  id: 'doc-1',
  knowledgeBaseId: 'kb-1',
  tenantId: 'tenant-1',
  fileName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  status: 'ready',
  uploadedBy: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('knowledgeBaseApi', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    deleteMock.mockReset()
  })

  describe('fetchKnowledgeBases', () => {
    it('calls GET knowledge-bases and returns data array', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: [mockKnowledgeBase] }),
      })

      const result = await fetchKnowledgeBases()

      expect(getMock).toHaveBeenCalledWith('knowledge-bases')
      expect(result).toEqual([mockKnowledgeBase])
    })
  })

  describe('fetchKnowledgeBase', () => {
    it('calls GET knowledge-bases/:id and returns data', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockKnowledgeBase }),
      })

      const result = await fetchKnowledgeBase('kb-1')

      expect(getMock).toHaveBeenCalledWith('knowledge-bases/kb-1')
      expect(result).toEqual(mockKnowledgeBase)
    })
  })

  describe('createKnowledgeBase', () => {
    it('calls POST knowledge-bases with json body and returns data', async () => {
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockKnowledgeBase }),
      })

      const input = { name: 'Test KB', description: 'Test', visibility: 'private' as const }
      const result = await createKnowledgeBase(input)

      expect(postMock).toHaveBeenCalledWith('knowledge-bases', { json: input })
      expect(result).toEqual(mockKnowledgeBase)
    })
  })

  describe('deleteKnowledgeBase', () => {
    it('calls DELETE knowledge-bases/:id', async () => {
      deleteMock.mockResolvedValue(undefined)

      await deleteKnowledgeBase('kb-1')

      expect(deleteMock).toHaveBeenCalledWith('knowledge-bases/kb-1')
    })
  })

  describe('fetchDocuments', () => {
    it('calls GET knowledge-bases/:id/documents with searchParams', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: [mockDocument], total: 1 }),
      })

      const result = await fetchDocuments('kb-1', { page: 1, pageSize: 10, status: 'ready' })

      expect(getMock).toHaveBeenCalledWith('knowledge-bases/kb-1/documents', {
        searchParams: { page: '1', page_size: '10', status: 'ready' },
      })
      expect(result).toEqual({ data: [mockDocument], total: 1 })
    })

    it('calls GET without optional params when not provided', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: [mockDocument], total: 1 }),
      })

      await fetchDocuments('kb-1')

      expect(getMock).toHaveBeenCalledWith('knowledge-bases/kb-1/documents', {
        searchParams: {},
      })
    })
  })

  describe('uploadDocument', () => {
    it('calls POST knowledge-bases/:id/documents with FormData body and returns data', async () => {
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockDocument }),
      })

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const result = await uploadDocument('kb-1', file)

      expect(postMock).toHaveBeenCalledWith(
        'knowledge-bases/kb-1/documents',
        expect.objectContaining({ body: expect.any(FormData) }),
      )
      expect(result).toEqual(mockDocument)
    })
  })

  describe('deleteDocument', () => {
    it('calls DELETE knowledge-bases/:kbId/documents/:docId', async () => {
      deleteMock.mockResolvedValue(undefined)

      await deleteDocument('kb-1', 'doc-1')

      expect(deleteMock).toHaveBeenCalledWith('knowledge-bases/kb-1/documents/doc-1')
    })
  })
})
