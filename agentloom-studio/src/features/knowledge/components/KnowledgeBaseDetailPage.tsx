import { useState, useCallback, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { ArrowLeft, FileText, Trash2, Upload } from 'lucide-react'
import { z } from 'zod'
import { Pagination } from '@/shared/components'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import {
  useDeleteDocument,
  useDocuments,
  useKnowledgeBase,
  useUpdateKnowledgeBaseSettings,
  useUploadDocument,
} from '../hooks/useKnowledgeBases'
import {
  useKnowledgeBaseSocket,
  type DocumentProgressStage,
} from '../hooks/useKnowledgeBaseSocket'
import {
  formatFileSize,
  type DocumentStatus,
  getDocumentStatusLabel,
  getKnowledgeBaseStatusLabel,
  type KnowledgeBaseDocument,
  type KnowledgeBaseStatus,
} from '../types'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const DOCUMENT_PAGE_SIZE = 20
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx'] as const
const FILE_INPUT_ACCEPT = [
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

type DocumentStatusFilter =
  | 'all'
  | 'uploading'
  | 'processing'
  | 'indexing'
  | 'ready'
  | 'error'

const DOCUMENT_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: DocumentStatusFilter
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'uploading', label: '上传中' },
  { value: 'processing', label: '处理中' },
  { value: 'indexing', label: '索引中' },
  { value: 'ready', label: '就绪' },
  { value: 'error', label: '错误' },
]

const knowledgeBaseSettingsSchema = z.object({
  chunkSize: z
    .number()
    .int('分块大小必须是整数')
    .min(64, '分块大小不能小于 64')
    .max(8192, '分块大小不能大于 8192')
    .multipleOf(64, '分块大小必须是 64 的倍数'),
  chunkOverlap: z
    .number()
    .int('分块重叠必须是整数')
    .min(0, '分块重叠不能小于 0')
    .max(4096, '分块重叠不能大于 4096')
    .multipleOf(16, '分块重叠必须是 16 的倍数'),
  embeddingModel: z.string().trim().min(1, '请输入 Embedding 模型'),
})

type KnowledgeBaseSettingsFormInput = z.input<typeof knowledgeBaseSettingsSchema>
type KnowledgeBaseSettingsFormValues = z.output<typeof knowledgeBaseSettingsSchema>

interface UploadFeedback {
  id: string
  fileName: string
  status: 'uploading' | 'failed'
  message?: string
}

function isDocumentStatusFilter(value: string): value is DocumentStatusFilter {
  return DOCUMENT_STATUS_FILTER_OPTIONS.some((option) => option.value === value)
}

function mapStatusFilterToDocumentStatus(
  filter: DocumentStatusFilter,
): DocumentStatus | undefined {
  switch (filter) {
    case 'uploading':
      return 'uploaded'
    case 'processing':
    case 'indexing':
      return 'processing'
    case 'ready':
      return 'ready'
    case 'error':
      return 'failed'
    default:
      return undefined
  }
}

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ''
  }

  return fileName.slice(lastDotIndex).toLowerCase()
}

function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name)

  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension as (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number])) {
    return '仅支持 PDF、TXT、Markdown 和 DOCX 文件'
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `文件大小不能超过 ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}`
  }

  return null
}

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

function getProgressStageLabel(stage: DocumentProgressStage): string {
  const labels: Record<DocumentProgressStage, string> = {
    preparing: '准备处理文件',
    parsing: '解析文档内容',
    chunking: '生成语义分块',
    queueing: '提交索引任务',
    completed: '处理完成',
  }

  return labels[stage]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

interface KnowledgeBaseDetailPageProps {
  knowledgeBaseId: string
}

export function KnowledgeBaseDetailPage({
  knowledgeBaseId,
}: KnowledgeBaseDetailPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFeedbackSequenceRef = useRef(0)
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null)
  const { notify } = useToast()
  const [isDragOver, setIsDragOver] = useState(false)
  const [documentPage, setDocumentPage] = useState(1)
  const [statusFilter, setStatusFilter] =
    useState<DocumentStatusFilter>('all')
  const [deleteTarget, setDeleteTarget] =
    useState<KnowledgeBaseDocument | null>(null)
  const [uploadFeedbacks, setUploadFeedbacks] = useState<UploadFeedback[]>([])
  const documentStatus = mapStatusFilterToDocumentStatus(statusFilter)

  const {
    data: knowledgeBase,
    isLoading: kbLoading,
    error: kbError,
  } = useKnowledgeBase(knowledgeBaseId)
  const { documentEvents } = useKnowledgeBaseSocket(
    knowledgeBase?.tenantId,
    knowledgeBaseId,
  )

  const { data: documentResponse, isLoading: docsLoading } = useDocuments(
    knowledgeBaseId,
    {
      page: documentPage,
      pageSize: DOCUMENT_PAGE_SIZE,
      status: documentStatus,
    },
  )
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()
  const updateSettingsMutation = useUpdateKnowledgeBaseSettings()
  const documents = documentResponse?.data ?? []

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<
    KnowledgeBaseSettingsFormInput,
    unknown,
    KnowledgeBaseSettingsFormValues
  >({
    resolver: zodResolver(knowledgeBaseSettingsSchema),
    defaultValues: {
      chunkSize: 512,
      chunkOverlap: 64,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    },
  })

  useEffect(() => {
    if (!knowledgeBase) {
      return
    }

    reset({
      chunkSize: knowledgeBase.chunkSize,
      chunkOverlap: knowledgeBase.chunkOverlap,
      embeddingModel: knowledgeBase.embeddingModel,
    })
  }, [knowledgeBase, reset])

  useEffect(() => {
    if (documentResponse && documentPage > documentResponse.meta.totalPages) {
      setDocumentPage(documentResponse.meta.totalPages)
    }
  }, [documentPage, documentResponse])

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
      if (!files?.length) {
        return
      }

      Array.from(files).forEach((file) => {
        const feedbackId = `${file.name}-${file.lastModified}-${file.size}-${uploadFeedbackSequenceRef.current}`
        uploadFeedbackSequenceRef.current += 1

        const validationError = validateUploadFile(file)

        if (validationError) {
          setUploadFeedbacks((current) => [
            ...current,
            {
              id: feedbackId,
              fileName: file.name,
              status: 'failed',
              message: validationError,
            },
          ])
          return
        }

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
                message: getErrorMessage(error),
              })
            },
          },
        )
      })
    },
    [knowledgeBaseId, removeUploadFeedback, updateUploadFeedback, uploadMutation],
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleUpload(e.target.files)
      e.target.value = ''
    },
    [handleUpload],
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
    (event: React.MouseEvent<HTMLButtonElement>, doc: KnowledgeBaseDocument) => {
      deleteRestoreFocusRef.current = event.currentTarget
      setDeleteTarget(doc)
    },
    [],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) {
      return
    }

    deleteMutation.mutate(
      {
        knowledgeBaseId,
        documentId: deleteTarget.id,
      },
      {
        onSettled: () => setDeleteTarget(null),
      },
    )
  }, [deleteMutation, deleteTarget, knowledgeBaseId])

  const handleStatusFilterChange = useCallback((value: string) => {
    if (!isDocumentStatusFilter(value)) {
      return
    }

    setStatusFilter(value)
    setDocumentPage(1)
  }, [])

  const handleResetSettings = useCallback(() => {
    if (!knowledgeBase) {
      return
    }

    reset({
      chunkSize: knowledgeBase.chunkSize,
      chunkOverlap: knowledgeBase.chunkOverlap,
      embeddingModel: knowledgeBase.embeddingModel,
    })
  }, [knowledgeBase, reset])

  const handleSaveSettings = handleSubmit(async (values) => {
    try {
      await updateSettingsMutation.mutateAsync({
        id: knowledgeBaseId,
        input: values,
      })
      reset(values)
      notify({
        description: '知识库设置已保存',
        variant: 'success',
      })
    } catch (error) {
      notify({
        description: getErrorMessage(error),
        variant: 'error',
      })
    }
  })

  if (kbError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">加载知识库失败: {kbError.message}</p>
      </div>
    )
  }

  if (kbLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({ to: '/resources/knowledge-bases' })
          }
          aria-label="返回知识库列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div>
          <h1 className="text-2xl font-bold">{knowledgeBase?.name}</h1>
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

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground',
        )}
        data-testid="upload-area"
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {uploadMutation.isPending
            ? `正在并行上传 ${uploadFeedbacks.filter((item) => item.status === 'uploading').length} 个文件...`
            : '拖拽文件到此处或点击上传（支持多文件）'}
        </p>
        <p className="text-xs text-muted-foreground">
          文档处理状态与进度会通过实时事件自动刷新，无需手动重载页面。
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          className="hidden"
          onChange={handleFileInputChange}
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
          <p className="mt-1 text-lg font-semibold">
            {knowledgeBase?.chunkSize ?? 512}
          </p>
          <p className="text-xs text-muted-foreground">
            当前知识库的单块 token 上限
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">分块重叠</p>
          <p className="mt-1 text-lg font-semibold">
            {knowledgeBase?.chunkOverlap ?? 64}
          </p>
          <p className="text-xs text-muted-foreground">
            相邻分块共享的 token 数量
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Embedding 模型</p>
          <p className="mt-1 text-lg font-semibold">
            {knowledgeBase?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL}
          </p>
          <p className="text-xs text-muted-foreground">
            用于文档向量化与召回的模型
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">知识库设置</h2>
            <p className="text-sm text-muted-foreground">
              保存后，新上传或重新处理的文档会使用新的分块与向量化配置。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSettings}
            disabled={updateSettingsMutation.isPending || !isDirty}
          >
            重置修改
          </Button>
        </div>

        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={handleSaveSettings}
        >
          <div className="space-y-2">
            <label
              htmlFor="chunk-size"
              className="text-xs font-medium text-foreground"
            >
              分块大小
            </label>
            <Input
              id="chunk-size"
              type="number"
              min={64}
              max={8192}
              step={64}
              disabled={updateSettingsMutation.isPending}
              {...register('chunkSize', { valueAsNumber: true })}
            />
            {errors.chunkSize && (
              <p className="text-xs text-destructive">
                {errors.chunkSize.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="chunk-overlap"
              className="text-xs font-medium text-foreground"
            >
              分块重叠
            </label>
            <Input
              id="chunk-overlap"
              type="number"
              min={0}
              max={4096}
              step={16}
              disabled={updateSettingsMutation.isPending}
              {...register('chunkOverlap', { valueAsNumber: true })}
            />
            {errors.chunkOverlap && (
              <p className="text-xs text-destructive">
                {errors.chunkOverlap.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="embedding-model"
              className="text-xs font-medium text-foreground"
            >
              Embedding 模型
            </label>
            <Input
              id="embedding-model"
              type="text"
              placeholder="例如 text-embedding-3-small"
              disabled={updateSettingsMutation.isPending}
              {...register('embeddingModel')}
            />
            {errors.embeddingModel && (
              <p className="text-xs text-destructive">
                {errors.embeddingModel.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 md:col-span-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              建议模型：`text-embedding-3-small`、`text-embedding-3-large`。
            </p>
            <Button
              type="submit"
              disabled={updateSettingsMutation.isPending || !isDirty}
            >
              {updateSettingsMutation.isPending ? '保存中...' : '保存设置'}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">文档列表</h2>
            <p className="text-xs text-muted-foreground">
              共 {documentResponse?.meta.total ?? documents.length} 个文档
            </p>
          </div>
          <Tabs
            value={statusFilter}
            defaultValue="all"
            onValueChange={handleStatusFilterChange}
            className="w-full md:w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 gap-1 md:grid-cols-6 md:w-auto">
              {DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="text-xs"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {docsLoading && (
          <p className="mt-4 text-center text-muted-foreground">加载文档中...</p>
        )}

        {!docsLoading && documents.length === 0 && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 py-8">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {statusFilter === 'all'
                ? '还没有文档，上传文件开始使用'
                : '当前筛选条件下暂无文档'}
            </p>
          </div>
        )}

        {!docsLoading && documents.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="divide-y divide-border rounded-lg border border-border">
              {documents.map((doc) => {
                const liveEvent = documentEvents[doc.id]
                const displayStatus = liveEvent?.status ?? doc.status
                const displayErrorMessage =
                  liveEvent?.errorMessage ?? doc.errorMessage
                const displayProgress =
                  displayStatus === 'processing' ? liveEvent?.progress : undefined

                return (
                  <div key={doc.id} className="flex items-start justify-between p-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doc.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDocumentType(doc.fileName, doc.mimeType)} ·{' '}
                          {formatFileSize(doc.sizeBytes)} · 上传于{' '}
                          {formatDateTime(doc.createdAt)}
                        </p>
                        {displayStatus === 'failed' && (
                          <p className="text-xs text-destructive">
                            {displayErrorMessage ??
                              '处理失败，请查看服务端日志后重试上传。'}
                          </p>
                        )}
                        {displayProgress && (
                          <div
                            className="mt-2 space-y-1"
                            data-testid={`document-progress-${doc.id}`}
                          >
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{getProgressStageLabel(displayProgress.stage)}</span>
                              <span>{displayProgress.percentage}%</span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${doc.fileName} 处理进度`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={displayProgress.percentage}
                              className="h-1.5 overflow-hidden rounded-full bg-muted"
                            >
                              <div
                                className="h-full rounded-full bg-blue-500 transition-[width]"
                                style={{ width: `${displayProgress.percentage}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              第 {displayProgress.currentStep}/
                              {displayProgress.totalSteps} 步
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          getStatusBadgeClass(displayStatus),
                        )}
                      >
                        {getDocumentStatusLabel(displayStatus)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => handleDeleteDoc(event, doc)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`删除 ${doc.fileName}`}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {documentResponse && documentResponse.meta.totalPages > 1 && (
              <Pagination
                page={documentResponse.meta.page}
                totalPages={documentResponse.meta.totalPages}
                onPageChange={setDocumentPage}
                isLoading={docsLoading}
              />
            )}
          </div>
        )}
      </div>

      <Dialog.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 px-4 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl"
            onCloseAutoFocus={(event) => {
              const element = deleteRestoreFocusRef.current
              if (element) {
                event.preventDefault()
                element.focus()
              }
              deleteRestoreFocusRef.current = null
            }}
          >
            <div className="space-y-2">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                删除文档
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                确认删除文档「{deleteTarget?.fileName}」吗？相关分块记录会一并清理。
              </Dialog.Description>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline">取消</Button>
              </Dialog.Close>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
