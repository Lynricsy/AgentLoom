import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Database,
  FileSearch,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLlmModels } from '@/features/llm'
import { Pagination } from '@/shared/components'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
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

function getStatusBadgeClass(status: string): string {
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

  if (kbLoading || !knowledgeBase) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{kbError ? kbError.message : '加载知识库中...'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => {
              void navigate({ to: '/resources/knowledge-bases' })
            }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回知识库列表
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{knowledgeBase.name}</h1>
            <p className="text-sm text-muted-foreground">
              {knowledgeBase.description ?? '这个知识库还没有描述'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
              knowledgeBase.status,
            )}`}
          >
            {getKnowledgeBaseStatusLabel(knowledgeBase.status)}
          </span>
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            文档规模
          </p>
          <p className="mt-2 text-2xl font-semibold">{knowledgeBase.documentCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">已接入文档</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            节点规模
          </p>
          <p className="mt-2 text-2xl font-semibold">{knowledgeBase.nodeCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">当前索引节点数</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            分块策略
          </p>
          <p className="mt-2 text-base font-semibold">
            {getChunkingStrategyLabel(knowledgeBase.chunkingStrategy)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            检索 Top K {knowledgeBase.retrievalStrategy.topK}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Embedding
          </p>
          <p className="mt-2 text-base font-semibold">
            {selectedEmbeddingModel?.name ?? knowledgeBase.embeddingModel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedEmbeddingModel?.modelName ?? '使用知识库当前配置'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">检索策略</h2>
              <p className="text-sm text-muted-foreground">
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
            <label className="space-y-2 text-sm">
              <span className="font-medium">Embedding 模型</span>
              <NativeSelect
                value={settings.embeddingModelConfigId ?? ''}
                onValueChange={(value) => {
                  setSettings((current) => ({
                    ...current,
                    embeddingModelConfigId: value || null,
                  }))
                }}
              >
                <option value="">使用默认 Embedding Key + 模型名</option>
                {embeddingModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.modelName}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">分块策略</span>
              <NativeSelect
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
                {CHUNKING_STRATEGY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>

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

            <label className="space-y-2 text-sm">
              <span className="font-medium">重排策略</span>
              <NativeSelect
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
                {RERANKER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>

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

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium">Query Orchestration</span>
              <NativeSelect
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
                {QUERY_ORCHESTRATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>

            {queryOrchestration.type === 'hyde' && (
              <>
                <label className="space-y-2 text-sm">
                  <span className="font-medium">HyDE 模型</span>
                  <NativeSelect
                    value={queryOrchestration.modelConfigId ?? ''}
                    onValueChange={(value) => {
                      setSettings((current) => ({
                        ...current,
                        queryOrchestration: {
                          ...queryOrchestration,
                          modelConfigId: value || null,
                        },
                      }))
                    }}
                  >
                    <option value="">使用默认聊天模型</option>
                    {chatModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.modelName}
                      </option>
                    ))}
                  </NativeSelect>
                </label>

                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="font-medium">HyDE Prompt Template</span>
                  <textarea
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
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="text-lg font-semibold">测试检索</h2>
            <p className="text-sm text-muted-foreground">
              用当前知识库的完整策略直接验证检索结果。
            </p>
          </div>

          <div className="space-y-3">
            <Input
              value={testQuery}
              onChange={(event) => setTestQuery(event.target.value)}
              placeholder="输入你希望验证的查询问题"
            />
            <div className="flex items-center gap-3">
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
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {result.fileName ?? result.documentId}
                    </p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      score {result.score.toFixed(3)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/90">
                    {result.content}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {renderLocation(result)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {testSearchMutation.isPending
                  ? '正在执行测试检索...'
                  : '这里会展示测试检索结果。'}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">文档与构建状态</h2>
            <p className="text-sm text-muted-foreground">
              上传文档后会自动进入解析、切分与索引流程。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as DocumentStatusFilter)
                setDocumentPage(1)
              }}
            >
              {DOCUMENT_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
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
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            当前知识库未配置可用的 Embedding 模型，上传后的检索质量无法保证。建议先完成策略配置再上传。
          </div>
        )}

        <div className="space-y-3">
          {docsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>加载文档列表中...</span>
            </div>
          )}

          {!docsLoading && documents.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              当前筛选条件下没有文档。
            </div>
          )}

          {!docsLoading &&
            documents.map((document) => {
              const liveEvent = documentEvents[document.id]
              const effectiveStatus = liveEvent?.status ?? document.status
              const progress = liveEvent?.progress

              return (
                <div
                  key={document.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {document.fileName}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(
                            effectiveStatus,
                          )}`}
                        >
                          {getDocumentStatusLabel(effectiveStatus)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(document.sizeBytes)}</span>
                        <span>·</span>
                        <span>{document.mimeType}</span>
                        <span>·</span>
                        <span>{formatDateTime(document.createdAt)}</span>
                      </div>
                      {progress && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {getProgressStageLabel(progress.stage)} ·{' '}
                          {progress.percentage}%
                        </p>
                      )}
                      {(liveEvent?.errorMessage ?? document.errorMessage) && (
                        <p className="mt-2 text-xs text-rose-600">
                          {liveEvent?.errorMessage ?? document.errorMessage}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-600"
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
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">统一工具语义</h2>
            <p className="text-sm text-muted-foreground">
              Agent runtime 现在只暴露一个 `search_knowledge` 工具，调用时必须显式传
              `knowledgeBaseIds`，并且这些 ID 只能来自连接到 Agent 的知识库节点。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
