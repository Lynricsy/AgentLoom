export {
  fetchKnowledgeBases,
  fetchKnowledgeBase,
  fetchAllKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBaseSettings,
  deleteKnowledgeBase,
  fetchDocuments,
  uploadDocument,
  deleteDocument,
} from './api/knowledgeBaseApi';
export { knowledgeBaseKeys } from './api/knowledgeBaseKeys';

export {
  useKnowledgeBases,
  useAllKnowledgeBases,
  useKnowledgeBase,
  useDocuments,
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
  useUpdateKnowledgeBaseSettings,
  useUploadDocument,
  useDeleteDocument,
} from './hooks/useKnowledgeBases';
export {
  useKnowledgeBaseSocket,
  resolveKnowledgeSocketUrl,
} from './hooks/useKnowledgeBaseSocket';
export type {
  DocumentProcessingProgress,
  LiveDocumentStatusEvent,
} from './hooks/useKnowledgeBaseSocket';

export { KnowledgeBasesPage } from './components/KnowledgeBasesPage';
export { KnowledgeBaseDetailPage } from './components/KnowledgeBaseDetailPage';

export type {
  KnowledgeBase,
  KnowledgeBaseDocument,
  CreateKnowledgeBaseInput,
  UpdateKnowledgeBaseSettingsInput,
  DocumentListParams,
  KnowledgeBaseNodeConfig,
} from './types';
export {
  KNOWLEDGE_BASE_VISIBILITIES,
  DOCUMENT_STATUSES,
  KNOWLEDGE_BASE_STATUSES,
  getDocumentStatusLabel,
  getDocumentStatusVariant,
  getKnowledgeBaseStatusLabel,
  formatFileSize,
  buildKnowledgeBaseNodeConfig,
  isKnowledgeBaseConfigured,
} from './types';
export type {
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility,
  DocumentStatus,
} from './types';
