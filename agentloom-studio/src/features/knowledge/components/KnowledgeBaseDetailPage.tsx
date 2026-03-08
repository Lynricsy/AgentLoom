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
  getKnowledgeBaseStatusLabel,
  formatFileSize,
  type KnowledgeBaseStatus,
  type KnowledgeBaseDocument,
} from '../types'

const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_CHUNK_OVERLAP = 64

interface UploadFeedback {
  id: string
  fileName: string
  status: 'uploading' | 'failed'
  message?: string
}

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

function getKnowledgeBaseStatusClass(status: KnowledgeBaseStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-500/10 text-emerald-700'
    case 'processing':
      return 'bg-blue-500/10 text-blue-700'
    case 'failed':
      return 'bg-rose-500/10 text-rose-700'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatDocumentType(fileName: string, mimeType: string): string {
  const extension = fileName.split('.').pop()?.trim().toUpperCase()
  if (extension) {
    return extension
  }

  const mimeLabel = mimeType.split('/').pop()?.replace(/[-+]/g, ' ')
  return mimeLabel ? mimeLabel.toUpperCase() : '未知格式'
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

interface KnowledgeBaseDetailPageProps {
  /** 知识库 ID，由路由参数传入 */
  knowledgeBaseId: string
}

export function KnowledgeBaseDetailPage({
  knowledgeBaseId,
}: KnowledgeBaseDetailPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadFeedbacks, setUploadFeedbacks] = useState<UploadFeedback[]>([])

  const {
    data: knowledgeBase,
    isLoading: kbLoading,
    error: kbError,
  } = useKnowledgeBase(knowledgeBaseId)
  const { data: documentResponse, isLoading: docsLoading } =
    useDocuments(knowledgeBaseId)
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()
  const documents = documentResponse?.data ?? []

  const removeUploadFeedback = useCallback((feedbackId: string) => {
    setUploadFeedbacks((current) =>
      current.filter((item) => item.id !== feedbackId),
    )
  }, [])

  const updateUploadFeedback = useCallback(
    (feedbackId: string, patch: Partial<UploadFeedback>) => {
      setUploadFeedbacks((current) =>
        current.map((item) =>
          item.id === feedbackId ? { ...item, ...patch } : item,
        ),
      )
    },
    [],
  )

  const handleUpload = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return
      Array.from(files).forEach((file) => {
        const feedbackId = `${file.name}-${file.lastModified}-${file.size}`

        setUploadFeedbacks((current) => [
          ...current,
          {
            id: feedbackId,
            fileName: file.name,
            status: 'uploading',
            message: '文件上传中...',
          },
        ])

        uploadMutation.mutate(
          { knowledgeBaseId, file },
          {
            onSuccess: () => {
              removeUploadFeedback(feedbackId)
            },
            onError: (error) => {
              updateUploadFeedback(feedbackId, {
                status: 'failed',
                message:
                  error instanceof Error ? error.message : '上传失败，请稍后重试',
              })
            },
          },
        )
      })
    },
    [knowledgeBaseId, removeUploadFeedback, updateUploadFeedback, uploadMutation],
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
      const confirmed = window.confirm(
        `确认删除文档“${doc.fileName}”吗？相关分块记录会一并清理。`,
      )

      if (!confirmed) {
        return
      }

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
          {knowledgeBase && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{knowledgeBase.documentCount} 个文档</span>
              <span>·</span>
              <span>{knowledgeBase.chunkCount} 个分块</span>
              <span>·</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${getKnowledgeBaseStatusClass(
                  knowledgeBase.status,
                )}`}
              >
                {getKnowledgeBaseStatusLabel(knowledgeBase.status)}
              </span>
            </div>
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
              ? `正在并行上传 ${uploadFeedbacks.filter((item) => item.status === 'uploading').length} 个文件...`
              : '拖拽文件到此处或点击上传（支持多文件）'}
          </p>
          <p className="text-xs text-muted-foreground">
            当前使用浏览器并发上传；实时处理状态推送仍依赖后端事件通道。
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

      {uploadFeedbacks.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium">上传队列</p>
          <div className="mt-2 flex flex-col gap-2">
            {uploadFeedbacks.map((feedback) => (
              <div
                key={feedback.id}
                className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{feedback.fileName}</p>
                  {feedback.message && (
                    <p
                      className={cn(
                        'truncate text-muted-foreground',
                        feedback.status === 'failed' && 'text-destructive',
                      )}
                    >
                      {feedback.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="ml-3 text-muted-foreground hover:text-foreground"
                  onClick={() => removeUploadFeedback(feedback.id)}
                >
                  关闭
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">分块大小</p>
          <p className="mt-1 text-lg font-semibold">{DEFAULT_CHUNK_SIZE}</p>
          <p className="text-xs text-muted-foreground">当前系统默认 token 上限</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">分块重叠</p>
          <p className="mt-1 text-lg font-semibold">{DEFAULT_CHUNK_OVERLAP}</p>
          <p className="text-xs text-muted-foreground">当前系统默认 overlap token</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Embedding 模型</p>
          <p className="mt-1 text-lg font-semibold">待接入</p>
          <p className="text-xs text-muted-foreground">向量索引链路尚未返回模型信息</p>
        </div>
      </div>

      {/* 文档加载中 */}
      {docsLoading && (
        <p className="text-muted-foreground text-center">
          加载文档中...
        </p>
      )}

      {/* 空文档状态 */}
      {!docsLoading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <FileText className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            还没有文档，上传文件开始使用
          </p>
        </div>
      )}

      {/* 文档列表 */}
      {!docsLoading && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">文档列表</h2>
            <p className="text-xs text-muted-foreground">
              共 {documentResponse?.meta.total ?? documents.length} 个文档
            </p>
          </div>
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
                      {formatDocumentType(doc.fileName, doc.mimeType)} · {formatFileSize(doc.sizeBytes)} · 上传于{' '}
                      {formatDateTime(doc.createdAt)}
                    </p>
                    {doc.status === 'failed' && (
                      <p className="text-xs text-destructive">
                        处理失败，请查看服务端日志后重试上传。
                      </p>
                    )}
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
