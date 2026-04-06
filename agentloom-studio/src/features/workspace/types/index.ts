export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  storageKey: string;
  sizeBytes: number | null;
  status: "creating" | "ready" | "archived" | "deleted";
  config: Record<string, unknown> | null;
  sourceKind?: "manual" | "sandbox_snapshot" | "execution_archive";
  isAutoArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceListResponse {
  data: Workspace[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface WorkspaceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeAutoArchived?: boolean;
}

export interface CreateWorkspacePayload {
  name: string;
  description?: string;
  createEmpty?: boolean;
}

export interface UpdateWorkspaceTextFilePayload {
  content: string;
}

export interface WorkspaceFileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  children?: WorkspaceFileNode[];
}

interface WorkspaceFilePreviewBase {
  kind: "text" | "image" | "pdf" | "unsupported";
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
  canDownload: boolean;
}

export interface WorkspaceTextFilePreview extends WorkspaceFilePreviewBase {
  kind: "text";
  content: string;
  encoding: "utf-8";
}

export interface WorkspaceBinaryFilePreview extends WorkspaceFilePreviewBase {
  kind: "image" | "pdf";
}

export interface WorkspaceUnsupportedFilePreview extends WorkspaceFilePreviewBase {
  kind: "unsupported";
  reason: string;
}

export type WorkspaceFilePreview =
  | WorkspaceTextFilePreview
  | WorkspaceBinaryFilePreview
  | WorkspaceUnsupportedFilePreview;
