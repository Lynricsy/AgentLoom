import { useState, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Upload, Trash2, FileText } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  useKnowledgeBase,
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
} from '../hooks/useKnowledgeBases'
import {
  getDocumentStatusLabel,
  formatFileSize,
} from '../types'
import type { KnowledgeBaseDocument } from '../types'

/** 文档状态对应的样式 */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'ready':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'processing':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
  }
}

interface KnowledgeBaseDetailPageProps {
  /** 知识库 ID，由路由参数传入 */
  knowledgeBaseId: string
}

/**
 * 知识库详情页面
 * 路由: /settings/knowledge-bases/:knowledgeBaseId
 * 功能: 文档列表、拖拽上传、WebSocket 实时状态、删除文档
 */
export function KnowledgeBaseDetailPage({
  knowledgeBaseId,
}: KnowledgeBaseDetailPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const {
    data: knowledgeBase,
    isLoading: kbLoading,
    error: kbError,
  } = useKnowledgeBase(knowledgeBaseId)
  const { data: documents, isLoading: docsLoading } =
    useDocuments(knowledgeBaseId)
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()

  const handleUpload = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      Array.from(files).forEach((file) => {
        uploadMutation.mutate({ knowledgeBaseId, file })
      })
    },
    [knowledgeBaseId, uploadMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      handleUpload(e.dataTransfer.files)
    },
    [handleUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDeleteDoc = useCallback(
    (doc: KnowledgeBaseDocument) => {
      deleteMutation.mutate({
        knowledgeBaseId,
        documentId: doc.id,
      })
    },
    [knowledgeBaseId, deleteMutation],
  )

  if (kbError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          加载知识库失败: {kbError.message}
        </p>
      </div>
    )
  }

  if (kbLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* 页头 */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({ to: '/settings/knowledge-bases' })
          }
          aria-label="返回知识库列表"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {knowledgeBase?.name}
          </h1>
          {knowledgeBase?.description && (
            <p className="text-sm text-muted-foreground">
              {knowledgeBase.description}
            </p>
          )}
        </div>
      </div>

      {/* 上传区域 */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex flex-col items-center justify-center gap-2 p-8 rounded-lg border-2 border-dashed transition-colors cursor-pointer w-full',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground',
        )}
        data-testid="upload-area"
      >
        <Upload className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {uploadMutation.isPending
            ? '上传中...'
            : '拖拽文件到此处或点击上传'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          data-testid="file-input"
        />
      </button>

      {/* 文档加载中 */}
      {docsLoading && (
        <p className="text-muted-foreground text-center">
          加载文档中...
        </p>
      )}

      {/* 空文档状态 */}
      {!docsLoading && (!documents || documents.length === 0) && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <FileText className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            还没有文档，上传文件开始使用
          </p>
        </div>
      )}

      {/* 文档列表 */}
      {!docsLoading && documents && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">文档列表</h2>
          <div className="border rounded-lg divide-y divide-border">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.sizeBytes)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      getStatusBadgeClass(doc.status),
                    )}
                  >
                    {getDocumentStatusLabel(doc.status)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteDoc(doc)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`删除 ${doc.fileName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
