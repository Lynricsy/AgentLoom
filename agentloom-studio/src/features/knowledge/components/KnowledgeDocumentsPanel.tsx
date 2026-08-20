import { useRef } from 'react'
import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { Pagination } from '@/shared/components'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import type {
  DocumentProgressStage,
  LiveDocumentStatusEvent,
} from '../hooks/useKnowledgeBaseSocket'
import {
  DOCUMENT_STATUS_FILTER_OPTIONS,
  FILE_INPUT_ACCEPT,
  STATUS_BADGE_VARIANT,
  type DocumentStatusFilter,
} from '../lib/knowledgeBaseDetail'
import {
  formatFileSize,
  getDocumentStatusLabel,
  type KnowledgeBaseDocument,
} from '../types'

const PROGRESS_STAGE_LABELS: Record<DocumentProgressStage, string> = {
  preparing: '准备文件',
  parsing: '解析文档',
  chunking: '生成节点',
  queueing: '提交索引',
  completed: '处理完成',
}

export interface KnowledgeDocumentsPanelProps {
  documents: KnowledgeBaseDocument[]
  documentEvents: Record<string, LiveDocumentStatusEvent>
  statusFilter: DocumentStatusFilter
  isLoading: boolean
  canUploadDocuments: boolean
  isUploading: boolean
  isDeleting: boolean
  page: number
  totalPages: number
  onStatusFilterChange: (statusFilter: DocumentStatusFilter) => void
  onUpload: (files: FileList | null) => void
  onDeleteDocument: (documentId: string, fileName: string) => void
  onPageChange: (page: number) => void
}

/** 文档列表与构建状态：上传入口、实时进度、失败原因与分页 */
export function KnowledgeDocumentsPanel({
  documents,
  documentEvents,
  statusFilter,
  isLoading,
  canUploadDocuments,
  isUploading,
  isDeleting,
  page,
  totalPages,
  onStatusFilterChange,
  onUpload,
  onDeleteDocument,
  onPageChange,
}: KnowledgeDocumentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            文档与构建状态
          </h2>
          <p className="text-sm text-muted">
            上传文档后会自动进入解析、切分与索引流程。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              onStatusFilterChange(value as DocumentStatusFilter)
            }}
          >
            <SelectTrigger className="w-36" aria-label="文档状态筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={FILE_INPUT_ACCEPT}
            data-testid="knowledge-file-input"
            className="hidden"
            onChange={(event) => {
              onUpload(event.target.files)
              event.target.value = ''
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !canUploadDocuments}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            上传文档
          </Button>
        </div>
      </div>

      {!canUploadDocuments && (
        <div className="rounded-card border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          当前知识库未配置可用的 Embedding
          模型，上传后的检索质量无法保证。建议先完成策略配置再上传。
        </div>
      )}

      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton
              key={index}
              data-testid="knowledge-document-skeleton"
              className="h-24 rounded-card"
            />
          ))}

        {!isLoading && documents.length === 0 && (
          <EmptyState
            icon={FileText}
            tone="var(--color-type-knowledge)"
            title={
              statusFilter === 'all'
                ? '还没有上传任何文档'
                : '当前筛选条件下没有文档'
            }
            description={
              statusFilter === 'all'
                ? '支持 PDF、TXT、Markdown 与 DOCX，上传后会自动解析、切分并建立索引。'
                : '换一个状态筛选，或先上传新的文档。'
            }
            action={
              statusFilter === 'all' ? (
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !canUploadDocuments}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  上传文档
                </Button>
              ) : null
            }
          />
        )}

        {!isLoading &&
          documents.map((document) => {
            const liveEvent = documentEvents[document.id]
            const effectiveStatus = liveEvent?.status ?? document.status
            const progress = liveEvent?.progress

            return (
              <div
                key={document.id}
                className="rounded-card border border-border bg-surface-elevated p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {document.fileName}
                      </p>
                      <Badge
                        size="sm"
                        className="whitespace-nowrap"
                        variant={
                          STATUS_BADGE_VARIANT[effectiveStatus] ?? 'secondary'
                        }
                      >
                        {getDocumentStatusLabel(effectiveStatus)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{formatFileSize(document.sizeBytes)}</span>
                      <span>·</span>
                      <span>{document.mimeType}</span>
                      <span>·</span>
                      <span>{new Date(document.createdAt).toLocaleString()}</span>
                    </div>
                    {progress && (
                      <p className="mt-2 text-xs text-muted">
                        {PROGRESS_STAGE_LABELS[progress.stage]} ·{' '}
                        {progress.percentage}%
                      </p>
                    )}
                    {(liveEvent?.errorMessage ?? document.errorMessage) && (
                      <p className="mt-2 text-xs text-error">
                        {liveEvent?.errorMessage ?? document.errorMessage}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted hover:text-error"
                    aria-label={`删除 ${document.fileName}`}
                    onClick={() =>
                      onDeleteDocument(document.id, document.fileName)
                    }
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
          isLoading={isLoading}
        />
      )}
    </Card>
  )
}
