import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createKnowledgeBase,
  deleteDocument,
  deleteKnowledgeBase,
  fetchDocuments,
  fetchKnowledgeBase,
  fetchKnowledgeBases,
  uploadDocument,
} from '../api/knowledgeBaseApi';
import { knowledgeBaseKeys } from '../api/knowledgeBaseKeys';
import type {
  CreateKnowledgeBaseInput,
  DocumentListParams,
} from '../types';

export function useKnowledgeBases() {
  return useQuery({
    queryKey: knowledgeBaseKeys.lists(),
    queryFn: fetchKnowledgeBases,
  });
}

export function useKnowledgeBase(id: string | null) {
  return useQuery({
    queryKey: knowledgeBaseKeys.detail(id ?? ''),
    queryFn: () => fetchKnowledgeBase(id!),
    enabled: !!id,
  });
}

export function useDocuments(
  knowledgeBaseId: string | null,
  params?: DocumentListParams,
) {
  return useQuery({
    queryKey: knowledgeBaseKeys.documentList(
      knowledgeBaseId ?? '',
      params ? { ...params } : undefined,
    ),
    queryFn: () => fetchDocuments(knowledgeBaseId!, params),
    enabled: !!knowledgeBaseId,
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['create-knowledge-base'],
    mutationFn: (input: CreateKnowledgeBaseInput) =>
      createKnowledgeBase(input),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.lists(),
      });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['delete-knowledge-base'],
    mutationFn: (id: string) => deleteKnowledgeBase(id),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.all,
      });
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['upload-document'],
    mutationFn: ({
      knowledgeBaseId,
      file,
    }: {
      knowledgeBaseId: string;
      file: File;
    }) => uploadDocument(knowledgeBaseId, file),
    gcTime: 0,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.documents(variables.knowledgeBaseId),
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['delete-document'],
    mutationFn: ({
      knowledgeBaseId,
      documentId,
    }: {
      knowledgeBaseId: string;
      documentId: string;
    }) => deleteDocument(knowledgeBaseId, documentId),
    gcTime: 0,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.documents(variables.knowledgeBaseId),
      });
    },
  });
}
