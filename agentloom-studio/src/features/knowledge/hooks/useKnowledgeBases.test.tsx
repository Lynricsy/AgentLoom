import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeBase, KnowledgeBaseDocument } from '../types'
import {
  useCreateKnowledgeBase,
  useDeleteDocument,
  useDeleteKnowledgeBase,
  useDocuments,
  useKnowledgeBase,
  useKnowledgeBases,
  useUploadDocument,
} from './useKnowledgeBases'

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
  errorMessage: null,
  uploadedBy: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useKnowledgeBases', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    deleteMock.mockReset()
  })

  describe('useKnowledgeBases', () => {
    it('fetches knowledge bases list', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: [mockKnowledgeBase] }),
      })

      const queryClient = createQueryClient()
      const { result } = renderHook(() => useKnowledgeBases(), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(getMock).toHaveBeenCalledWith('knowledge-bases')
      expect(result.current.data).toEqual([mockKnowledgeBase])
    })
  })

  describe('useKnowledgeBase', () => {
    it('fetches single knowledge base by id', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockKnowledgeBase }),
      })

      const queryClient = createQueryClient()
      const { result } = renderHook(() => useKnowledgeBase('kb-1'), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(getMock).toHaveBeenCalledWith('knowledge-bases/kb-1')
      expect(result.current.data).toEqual(mockKnowledgeBase)
    })

    it('is disabled when id is null', () => {
      const queryClient = createQueryClient()
      const { result } = renderHook(() => useKnowledgeBase(null), {
        wrapper: createWrapper(queryClient),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(getMock).not.toHaveBeenCalled()
    })
  })

  describe('useDocuments', () => {
    it('fetches documents for a knowledge base', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: [mockDocument], total: 1 }),
      })

      const queryClient = createQueryClient()
      const { result } = renderHook(() => useDocuments('kb-1'), {
        wrapper: createWrapper(queryClient),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(getMock).toHaveBeenCalledWith('knowledge-bases/kb-1/documents', {
        searchParams: {},
      })
      expect(result.current.data).toEqual({ data: [mockDocument], total: 1 })
    })

    it('is disabled when knowledgeBaseId is null', () => {
      const queryClient = createQueryClient()
      const { result } = renderHook(() => useDocuments(null), {
        wrapper: createWrapper(queryClient),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(getMock).not.toHaveBeenCalled()
    })
  })

  describe('useCreateKnowledgeBase', () => {
    it('calls createKnowledgeBase and invalidates list queries on success', async () => {
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockKnowledgeBase }),
      })

      const queryClient = createQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useCreateKnowledgeBase(), {
        wrapper: createWrapper(queryClient),
      })

      result.current.mutate({ name: 'New KB', description: 'New', visibility: 'private' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(postMock).toHaveBeenCalledWith('knowledge-bases', expect.objectContaining({ json: expect.anything() }))
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['knowledge-bases', 'list'] }),
      )
    })
  })

  describe('useUploadDocument', () => {
    it('calls uploadDocument and invalidates documents queries on success', async () => {
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: mockDocument }),
      })

      const queryClient = createQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useUploadDocument(), {
        wrapper: createWrapper(queryClient),
      })

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      result.current.mutate({ knowledgeBaseId: 'kb-1', file })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(postMock).toHaveBeenCalledWith(
        'knowledge-bases/kb-1/documents',
        expect.objectContaining({ body: expect.any(FormData) }),
      )
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['knowledge-bases', 'detail', 'kb-1', 'documents'] }),
      )
    })
  })

  describe('useDeleteDocument', () => {
    it('calls deleteDocument and invalidates documents queries on success', async () => {
      deleteMock.mockResolvedValue(undefined)

      const queryClient = createQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useDeleteDocument(), {
        wrapper: createWrapper(queryClient),
      })

      result.current.mutate({ knowledgeBaseId: 'kb-1', documentId: 'doc-1' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(deleteMock).toHaveBeenCalledWith('knowledge-bases/kb-1/documents/doc-1')
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['knowledge-bases', 'detail', 'kb-1', 'documents'] }),
      )
    })
  })

  describe('useDeleteKnowledgeBase', () => {
    it('calls deleteKnowledgeBase and invalidates all knowledge-bases queries on success', async () => {
      deleteMock.mockResolvedValue(undefined)

      const queryClient = createQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useDeleteKnowledgeBase(), {
        wrapper: createWrapper(queryClient),
      })

      result.current.mutate('kb-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(deleteMock).toHaveBeenCalledWith('knowledge-bases/kb-1')
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['knowledge-bases'] }),
      )
    })
  })
})
