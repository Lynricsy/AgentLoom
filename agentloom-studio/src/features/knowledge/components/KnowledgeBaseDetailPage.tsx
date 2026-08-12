import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeft,
  Database,
  FileSearch,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLlmModels } from '@/features/llm'
import { Pagination } from '@/shared/components'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { Textarea } from '@/shared/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import {
  useDeleteDocument,
  useDocuments,
  useKnowledgeBase,
  useRebuildKnowledgeBase,
  useTestKnowledgeBaseSearch,
  useUpdateKnowledgeBaseSettings,
  useUploadDocument,
} from '../hooks/useKnowledgeBases'
import {
  useKnowledgeBaseSocket,
  type DocumentProgressStage,
} from '../hooks/useKnowledgeBaseSocket'
import {
  formatFileSize,
  getChunkingStrategyLabel,
  getDocumentStatusLabel,
  getKnowledgeBaseStatusLabel,
  type KnowledgeBase,
  type KnowledgeChunkingStrategy,
  type KnowledgeQueryOrchestration,
  type KnowledgeRerankingStrategy,
  type KnowledgeRetrievalStrategy,
  type KnowledgeSearchResult,
  type UpdateKnowledgeBaseSettingsInput,
} from '../types'

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

/**
 * Radix Select 不允许 value 为空串的 SelectItem，因此「使用默认…」这类可主动选回的空语义
 * 用哨兵值承载，提交前再映射回 null。
 */
const USE_DEFAULT_MODEL = '__use_default__'

const CHUNKING_STRATEGY_OPTIONS: Array<{
  value: KnowledgeChunkingStrategy['type']
  label: string
}> = [
  { value: 'sentence_window', label: 'Sentence Window' },
  { value: 'sentence', label: '句子分块' },
  { value: 'markdown', label: 'Markdown 分块' },
]

const RERANKER_OPTIONS: Array<{
  value: KnowledgeRerankingStrategy['type']
  label: string
}> = [
  { value: 'none', label: '关闭重排' },
  { value: 'cohere', label: 'Cohere Rerank' },
]

const QUERY_ORCHESTRATION_OPTIONS: Array<{
  value: KnowledgeQueryOrchestration['type']
  label: string
}> = [
  { value: 'none', label: '直接查询' },
  { value: 'hyde', label: 'HyDE' },
]

type DocumentStatusFilter = 'all' | 'uploaded' | 'processing' | 'ready' | 'failed'

interface KnowledgeBaseSettingsDraft extends UpdateKnowledgeBaseSettingsInput {
  chunkingStrategy: KnowledgeChunkingStrategy
  retrievalStrategy: KnowledgeRetrievalStrategy
  rerankingStrategy: KnowledgeRerankingStrategy
  queryOrchestration: KnowledgeQueryOrchestration
  embeddingModelConfigId: string | null
}

const DOCUMENT_STATUS_FILTER_OPTIONS: Array<{
  value: DocumentStatusFilter
  label: string
}> = [
  { value: 'all', label: '全部文档' },
  { value: 'uploaded', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'ready', label: '已就绪' },
  { value: 'failed', label: '失败' },
]

function createDefaultSettings(): KnowledgeBaseSettingsDraft {
  return {
    chunkingStrategy: {
      type: 'sentence_window',
      windowSize: 3,
    },
    retrievalStrategy: {
      topK: 8,
      similarityThreshold: null,
    },
    rerankingStrategy: {
      type: 'none',
    },
    queryOrchestration: {
      type: 'none',
    },
    embeddingModelConfigId: null,
  }
}

function createSettingsFromKnowledgeBase(
  knowledgeBase: KnowledgeBase,
): KnowledgeBaseSettingsDraft {
  return {
    embeddingModel: knowledgeBase.embeddingModel,
    embeddingModelConfigId: knowledgeBase.embeddingModelConfigId,
    chunkingStrategy: knowledgeBase.chunkingStrategy,
    retrievalStrategy: knowledgeBase.retrievalStrategy,
    rerankingStrategy: knowledgeBase.rerankingStrategy,
    queryOrchestration: knowledgeBase.queryOrchestration,
  }
}

const STATUS_BADGE_VARIANT: Record<
  string,
  'success' | 'info' | 'error' | 'secondary'
> = {
  ready: 'success',
  processing: 'info',
  failed: 'error',
}

function getProgressStageLabel(stage: DocumentProgressStage): string {
  const labels: Record<DocumentProgressStage, string> = {
    preparing: '准备文件',
    parsing: '解析文档',
    chunking: '生成节点',
    queueing: '提交索引',
    completed: '处理完成',
  }

  return labels[stage]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

function renderLocation(result: KnowledgeSearchResult): string {
  const location = result.location
  if (!location) {
    return '无定位信息'
  }

  const segments: string[] = []
  if (typeof location.page === 'number') {
    segments.push(`页码 ${location.page}`)
  }
  if (typeof location.paragraph === 'number') {
    segments.push(`段落 ${location.paragraph}`)
  }
  if (typeof location.heading === 'string' && location.heading.length > 0) {
    segments.push(location.heading)
  }
  if (typeof location.charOffset === 'number') {
    segments.push(`偏移 ${location.charOffset}`)
  }

  return segments.length > 0 ? segments.join(' · ') : '无定位信息'
}

interface KnowledgeBaseDetailPageProps {
  knowledgeBaseId: string
}

export function KnowledgeBaseDetailPage({
  knowledgeBaseId,
}: KnowledgeBaseDetailPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { notify } = useToast()
  const [documentPage, setDocumentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('all')
  const [settings, setSettings] = useState<KnowledgeBaseSettingsDraft>(
    createDefaultSettings(),
  )
  const [testQuery, setTestQuery] = useState('')
  const [testTopK, setTestTopK] = useState(5)

  const {
    data: knowledgeBase,
    isLoading: kbLoading,
    error: kbError,
  } = useKnowledgeBase(knowledgeBaseId)
  const { documentEvents } = useKnowledgeBaseSocket(
    knowledgeBase?.tenantId,
    knowledgeBaseId,
  )
  const { data: llmModels } = useLlmModels()

  const documentStatus = statusFilter === 'all' ? undefined : statusFilter
  const { data: documentsResponse, isLoading: docsLoading } = useDocuments(
    knowledgeBaseId,
    {
      page: documentPage,
      pageSize: DOCUMENT_PAGE_SIZE,
      status: documentStatus,
    },
  )
  const updateSettingsMutation = useUpdateKnowledgeBaseSettings()
  const testSearchMutation = useTestKnowledgeBaseSearch()
  const rebuildMutation = useRebuildKnowledgeBase()
  const uploadMutation = useUploadDocument()
  const deleteDocumentMutation = useDeleteDocument()

  const documents = documentsResponse?.data ?? []
  const embeddingModels = useMemo(
    () => (llmModels ?? []).filter((model) => model.modelType === 'embedding'),
    [llmModels],
  )
  const chatModels = useMemo(
    () => (llmModels ?? []).filter((model) => model.modelType === 'chat'),
    [llmModels],
  )
  const selectedEmbeddingModel = useMemo(
    () =>
      embeddingModels.find(
        (model) => model.id === settings.embeddingModelConfigId,
      ) ?? null,
    [embeddingModels, settings.embeddingModelConfigId],
  )
  const canUploadDocuments = Boolean(knowledgeBase?.embeddingModel)
  const isSettingsDirty = useMemo(() => {
    if (!knowledgeBase) {
      return false
    }

    return (
      JSON.stringify(settings) !==
      JSON.stringify(createSettingsFromKnowledgeBase(knowledgeBase))
    )
  }, [knowledgeBase, settings])

  useEffect(() => {
    if (!knowledgeBase) {
      return
    }

    setSettings(createSettingsFromKnowledgeBase(knowledgeBase))
  }, [knowledgeBase])

  useEffect(() => {
    if (documentsResponse && documentPage > documentsResponse.meta.totalPages) {
      setDocumentPage(documentsResponse.meta.totalPages)
    }
  }, [documentPage, documentsResponse])

  useEffect(() => {
    if (!kbError) {
      return
    }

    notify({
      title: '知识库加载失败',
      description: getErrorMessage(kbError),
      variant: 'error',
    })
  }, [kbError, notify])

  const handleUpload = useCallback(
    (files: FileList | null) => {
      if (!files?.length) {
        return
      }

      Array.from(files).forEach((file) => {
        const validationError = validateUploadFile(file)
        if (validationError) {
          notify({
            description: validationError,
            variant: 'error',
          })
          return
        }

        uploadMutation.mutate(
          { knowledgeBaseId, file },
          {
            onError: (error) => {
              notify({
                description: getErrorMessage(error),
                variant: 'error',
              })
            },
          },
        )
      })
    },
    [knowledgeBaseId, notify, uploadMutation],
  )

  const handleDeleteDocument = useCallback(
    (documentId: string, fileName: string) => {
      if (!window.confirm(`确定要删除文档“${fileName}”吗？`)) {
        return
      }

      deleteDocumentMutation.mutate(
        {
          knowledgeBaseId,
          documentId,
        },
        {
          onError: (error) => {
            notify({
              description: getErrorMessage(error),
              variant: 'error',
            })
          },
        },
      )
    },
    [deleteDocumentMutation, knowledgeBaseId, notify],
  )

  const handleSaveSettings = useCallback(() => {
    updateSettingsMutation.mutate(
      {
        id: knowledgeBaseId,
        input: settings,
      },
      {
        onSuccess: () => {
          notify({
            description: '知识库策略已更新',
            variant: 'success',
          })
        },
        onError: (error) => {
          notify({
            description: getErrorMessage(error),
            variant: 'error',
          })
        },
      },
    )
  }, [knowledgeBaseId, notify, settings, updateSettingsMutation])

  const handleTestSearch = useCallback(() => {
    if (!testQuery.trim()) {
      notify({
        description: '请输入测试检索查询',
        variant: 'error',
      })
      return
    }

    testSearchMutation.mutate(
      {
        knowledgeBaseId,
        query: testQuery.trim(),
        topK: testTopK,
      },
      {
        onError: (error) => {
          notify({
            description: getErrorMessage(error),
            variant: 'error',
          })
        },
      },
    )
  }, [knowledgeBaseId, notify, testQuery, testTopK, testSearchMutation])

  const handleRebuild = useCallback(() => {
    rebuildMutation.mutate(knowledgeBaseId, {
      onSuccess: (result) => {
        notify({
          description: `已提交 ${result.documentCount} 个文档的重建任务`,
          variant: 'success',
        })
      },
      onError: (error) => {
        notify({
          description: getErrorMessage(error),
          variant: 'error',
        })
      },
    })
  }, [knowledgeBaseId, notify, rebuildMutation])

  const defaultSettings = createDefaultSettings()
  const chunkingStrategy = settings.chunkingStrategy ?? defaultSettings.chunkingStrategy
  const retrievalStrategy = settings.retrievalStrategy ?? defaultSettings.retrievalStrategy
  const rerankingStrategy = settings.rerankingStrategy ?? defaultSettings.rerankingStrategy
  const queryOrchestration = settings.queryOrchestration ?? defaultSettings.queryOrchestration

  if (kbLoading) {
    return (
      <div
        className="flex h-full flex-col gap-6 p-6"
        data-testid="knowledge-base-detail-skeleton"
      >
        <Skeleton className="h-12 w-72 rounded-card" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
        <Skeleton className="min-h-64 flex-1 rounded-card" />
      </div>
    )
  }

  if (!knowledgeBase) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title={kbError ? getErrorMessage(kbError) : '知识库不存在'}
          description="该知识库可能已被删除，或你没有访问权限。"
          action={
            <Button
              variant="outline"
              onClick={() => {
                void navigate({ to: '/resources/knowledge-bases' })
              }}
            >
              返回知识库列表
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <PageHeader
        icon={Database}
        tone="var(--color-type-knowledge)"
        breadcrumb={[
          { label: '知识库', to: '/resources/knowledge-bases' },
          { label: knowledgeBase.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {knowledgeBase.name}
            <Badge
              size="sm"
              variant={STATUS_BADGE_VARIANT[knowledgeBase.status] ?? 'secondary'}
            >
              {getKnowledgeBaseStatusLabel(knowledgeBase.status)}
            </Badge>
          </span>
        }
        description={knowledgeBase.description ?? '这个知识库还没有描述'}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigate({ to: '/resources/knowledge-bases' })
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回
            </Button>
            <Button
              variant="outline"
              onClick={handleRebuild}
              disabled={rebuildMutation.isPending}
            >
              {rebuildMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              重建索引/重切分
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">文档规模</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {knowledgeBase.documentCount}
          </p>
          <p className="mt-1 text-xs text-muted">已接入文档</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">节点规模</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {knowledgeBase.nodeCount}
          </p>
          <p className="mt-1 text-xs text-muted">当前索引节点数</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">分块策略</p>
          <p className="mt-2 truncate text-base font-semibold text-foreground">
            {getChunkingStrategyLabel(knowledgeBase.chunkingStrategy)}
          </p>
          <p className="mt-1 text-xs text-muted">
            检索 Top K {knowledgeBase.retrievalStrategy.topK}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Embedding</p>
          <p className="mt-2 truncate text-base font-semibold text-foreground">
            {selectedEmbeddingModel?.name ?? knowledgeBase.embeddingModel}
          </p>
          <p className="mt-1 truncate text-xs text-muted">
            {selectedEmbeddingModel?.modelName ?? '使用知识库当前配置'}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                检索策略
              </h2>
              <p className="text-sm text-muted">
                每个知识库独立定义分块、检索、重排与 query orchestration。
              </p>
            </div>
            <Button
              onClick={handleSaveSettings}
              disabled={updateSettingsMutation.isPending || !isSettingsDirty}
            >
              {updateSettingsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              保存策略
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <span className="font-medium">Embedding 模型</span>
              <Select
                value={settings.embeddingModelConfigId ?? USE_DEFAULT_MODEL}
                onValueChange={(value) => {
                  setSettings((current) => ({
                    ...current,
                    embeddingModelConfigId:
                      value === USE_DEFAULT_MODEL ? null : value,
                  }))
                }}
              >
                <SelectTrigger aria-label="Embedding 模型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USE_DEFAULT_MODEL}>使用默认 Embedding Key + 模型名</SelectItem>
                  {embeddingModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} · {model.modelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 text-sm">
              <span className="font-medium">分块策略</span>
              <Select
                value={chunkingStrategy.type}
                onValueChange={(value) => {
                  const nextStrategy: KnowledgeChunkingStrategy =
                    value === 'sentence'
                      ? { type: 'sentence', chunkSize: 512, chunkOverlap: 64 }
                      : value === 'markdown'
                        ? { type: 'markdown' }
                        : { type: 'sentence_window', windowSize: 3 }

                  setSettings((current) => ({
                    ...current,
                    chunkingStrategy: nextStrategy,
                  }))
                }}
              >
                <SelectTrigger aria-label="分块策略">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHUNKING_STRATEGY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {chunkingStrategy.type === 'sentence' && (
              <>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Chunk Size</span>
                  <Input
                    type="number"
                    min={64}
                    max={8192}
                    value={chunkingStrategy.chunkSize}
                    onChange={(event) => {
                      const chunkSize = Number(event.target.value)
                      setSettings((current) => ({
                        ...current,
                        chunkingStrategy: {
                          type: 'sentence',
                          chunkSize,
                          chunkOverlap: chunkingStrategy.chunkOverlap,
                        },
                      }))
                    }}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Chunk Overlap</span>
                  <Input
                    type="number"
                    min={0}
                    max={4096}
                    value={chunkingStrategy.chunkOverlap}
                    onChange={(event) => {
                      const chunkOverlap = Number(event.target.value)
                      setSettings((current) => ({
                        ...current,
                        chunkingStrategy: {
                          type: 'sentence',
                          chunkSize: chunkingStrategy.chunkSize,
                          chunkOverlap,
                        },
                      }))
                    }}
                  />
                </label>
              </>
            )}

            {chunkingStrategy.type === 'sentence_window' && (
              <label className="space-y-2 text-sm">
                <span className="font-medium">Window Size</span>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={chunkingStrategy.windowSize}
                  onChange={(event) => {
                    const windowSize = Number(event.target.value)
                    setSettings((current) => ({
                      ...current,
                      chunkingStrategy: {
                        type: 'sentence_window',
                        windowSize,
                      },
                    }))
                  }}
                />
              </label>
            )}

            <label className="space-y-2 text-sm">
              <span className="font-medium">检索 Top K</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={retrievalStrategy.topK}
                onChange={(event) => {
                  const topK = Number(event.target.value)
                  const nextStrategy: KnowledgeRetrievalStrategy = {
                    ...retrievalStrategy,
                    topK,
                  }
                  setSettings((current) => ({
                    ...current,
                    retrievalStrategy: nextStrategy,
                  }))
                }}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">相似度阈值</span>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.01"
                value={retrievalStrategy.similarityThreshold ?? ''}
                onChange={(event) => {
                  const rawValue = event.target.value
                  const similarityThreshold =
                    rawValue.trim() === '' ? null : Number(rawValue)
                  setSettings((current) => ({
                    ...current,
                    retrievalStrategy: {
                      ...retrievalStrategy,
                      similarityThreshold,
                    },
                  }))
                }}
                placeholder="留空表示不限制"
              />
            </label>

            <div className="space-y-2 text-sm">
              <span className="font-medium">重排策略</span>
              <Select
                value={rerankingStrategy.type}
                onValueChange={(value) => {
                  const nextStrategy: KnowledgeRerankingStrategy =
                    value === 'cohere'
                      ? {
                          type: 'cohere',
                          model: 'rerank-english-v2.0',
                          topN: 5,
                          apiKeyId: null,
                          baseUrl: null,
                          timeoutMs: null,
                        }
                      : { type: 'none' }
                  setSettings((current) => ({
                    ...current,
                    rerankingStrategy: nextStrategy,
                  }))
                }}
              >
                <SelectTrigger aria-label="重排策略">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RERANKER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rerankingStrategy.type === 'cohere' && (
              <>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Cohere 模型</span>
                  <Input
                    value={rerankingStrategy.model}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        rerankingStrategy: {
                          ...rerankingStrategy,
                          model: event.target.value,
                        },
                      }))
                    }}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">重排 Top N</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={rerankingStrategy.topN}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        rerankingStrategy: {
                          ...rerankingStrategy,
                          topN: Number(event.target.value),
                        },
                      }))
                    }}
                  />
                </label>
              </>
            )}

            <div className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium">Query Orchestration</span>
              <Select
                value={queryOrchestration.type}
                onValueChange={(value) => {
                  const nextStrategy: KnowledgeQueryOrchestration =
                    value === 'hyde'
                      ? {
                          type: 'hyde',
                          modelConfigId: null,
                          promptTemplate: null,
                        }
                      : { type: 'none' }

                  setSettings((current) => ({
                    ...current,
                    queryOrchestration: nextStrategy,
                  }))
                }}
              >
                <SelectTrigger aria-label="Query Orchestration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUERY_ORCHESTRATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {queryOrchestration.type === 'hyde' && (
              <>
                <div className="space-y-2 text-sm">
                  <span className="font-medium">HyDE 模型</span>
                  <Select
                    value={queryOrchestration.modelConfigId ?? USE_DEFAULT_MODEL}
                    onValueChange={(value) => {
                      setSettings((current) => ({
                        ...current,
                        queryOrchestration: {
                          ...queryOrchestration,
                          modelConfigId:
                            value === USE_DEFAULT_MODEL ? null : value,
                        },
                      }))
                    }}
                  >
                    <SelectTrigger aria-label="HyDE 模型">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={USE_DEFAULT_MODEL}>使用默认聊天模型</SelectItem>
                      {chatModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name} · {model.modelName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="font-medium">HyDE Prompt Template</span>
                  <Textarea
                    value={queryOrchestration.promptTemplate ?? ''}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        queryOrchestration: {
                          ...queryOrchestration,
                          promptTemplate: event.target.value || null,
                        },
                      }))
                    }}
                    rows={5}
                    placeholder="支持 {{query}} 占位符；留空则使用系统默认 HyDE 提示词"
                  />
                </label>
              </>
            )}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">测试检索</h2>
            <p className="text-sm text-muted">
              用当前知识库的完整策略直接验证检索结果。
            </p>
          </div>

          <div className="space-y-3">
            <Input
              value={testQuery}
              onChange={(event) => setTestQuery(event.target.value)}
              placeholder="输入你希望验证的查询问题"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="number"
                min={1}
                max={20}
                value={testTopK}
                onChange={(event) => setTestTopK(Number(event.target.value))}
                className="max-w-28"
              />
              <Button
                onClick={handleTestSearch}
                disabled={testSearchMutation.isPending}
              >
                {testSearchMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSearch className="mr-2 h-4 w-4" />
                )}
                执行测试检索
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {testSearchMutation.data?.results?.length ? (
              testSearchMutation.data.results.map((result) => (
                <div
                  key={result.nodeId}
                  className="rounded-card border border-border bg-surface-elevated p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {result.fileName ?? result.documentId}
                    </p>
                    <Badge size="sm" className="whitespace-nowrap">
                      score {result.score.toFixed(3)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-foreground/90">
                    {result.content}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {renderLocation(result)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-dashed border-border p-4 text-sm text-muted">
                {testSearchMutation.isPending
                  ? '正在执行测试检索...'
                  : '这里会展示测试检索结果。'}
              </div>
            )}
          </div>
        </Card>
      </div>

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
                setStatusFilter(value as DocumentStatusFilter)
                setDocumentPage(1)
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
                handleUpload(event.target.files)
                event.target.value = ''
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending || !canUploadDocuments}
            >
              {uploadMutation.isPending ? (
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
          {docsLoading &&
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                key={index}
                data-testid="knowledge-document-skeleton"
                className="h-24 rounded-card"
              />
            ))}

          {!docsLoading && documents.length === 0 && (
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
                    disabled={uploadMutation.isPending || !canUploadDocuments}
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    上传文档
                  </Button>
                ) : null
              }
            />
          )}

          {!docsLoading &&
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
                        <span>{formatDateTime(document.createdAt)}</span>
                      </div>
                      {progress && (
                        <p className="mt-2 text-xs text-muted">
                          {getProgressStageLabel(progress.stage)} ·{' '}
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
                        handleDeleteDocument(document.id, document.fileName)
                      }
                      disabled={deleteDocumentMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
        </div>

        {documentsResponse && documentsResponse.meta.totalPages > 1 && (
          <Pagination
            page={documentPage}
            totalPages={documentsResponse.meta.totalPages}
            onPageChange={setDocumentPage}
            isLoading={docsLoading}
          />
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-type-knowledge) 14%, transparent)',
              color: 'var(--color-type-knowledge)',
            }}
          >
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              统一工具语义
            </h2>
            <p className="mt-1 text-sm text-muted">
              Agent runtime 现在只暴露一个 `search_knowledge` 工具，调用时必须显式传
              `knowledgeBaseIds`，并且这些 ID 只能来自连接到 Agent 的知识库节点。
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
