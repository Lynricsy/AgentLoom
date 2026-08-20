import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeft,
  Database,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useLlmModels } from '@/features/llm'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import { KnowledgeBaseSettingsForm } from './KnowledgeBaseSettingsForm'
import { KnowledgeDocumentsPanel } from './KnowledgeDocumentsPanel'
import { KnowledgeSearchTester } from './KnowledgeSearchTester'
import {
  useDeleteDocument,
  useDocuments,
  useKnowledgeBase,
  useRebuildKnowledgeBase,
  useTestKnowledgeBaseSearch,
  useUpdateKnowledgeBaseSettings,
  useUploadDocument,
} from '../hooks/useKnowledgeBases'
import { useKnowledgeBaseSocket } from '../hooks/useKnowledgeBaseSocket'
import {
  DOCUMENT_PAGE_SIZE,
  STATUS_BADGE_VARIANT,
  createDefaultSettings,
  createSettingsFromKnowledgeBase,
  getErrorMessage,
  validateUploadFile,
  type DocumentStatusFilter,
  type KnowledgeBaseSettingsDraft,
} from '../lib/knowledgeBaseDetail'
import {
  getChunkingStrategyLabel,
  getKnowledgeBaseStatusLabel,
} from '../types'

interface KnowledgeBaseDetailPageProps {
  knowledgeBaseId: string
}

export function KnowledgeBaseDetailPage({
  knowledgeBaseId,
}: KnowledgeBaseDetailPageProps) {
  const navigate = useNavigate()
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

  const handleStatusFilterChange = useCallback(
    (nextStatusFilter: DocumentStatusFilter) => {
      setStatusFilter(nextStatusFilter)
      setDocumentPage(1)
    },
    [],
  )

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
        <KnowledgeBaseSettingsForm
          settings={settings}
          setSettings={setSettings}
          embeddingModels={embeddingModels}
          chatModels={chatModels}
          isDirty={isSettingsDirty}
          isSaving={updateSettingsMutation.isPending}
          onSave={handleSaveSettings}
        />

        <KnowledgeSearchTester
          query={testQuery}
          topK={testTopK}
          isPending={testSearchMutation.isPending}
          results={testSearchMutation.data?.results}
          onQueryChange={setTestQuery}
          onTopKChange={setTestTopK}
          onRunTest={handleTestSearch}
        />
      </div>

      <KnowledgeDocumentsPanel
        documents={documents}
        documentEvents={documentEvents}
        statusFilter={statusFilter}
        isLoading={docsLoading}
        canUploadDocuments={canUploadDocuments}
        isUploading={uploadMutation.isPending}
        isDeleting={deleteDocumentMutation.isPending}
        page={documentPage}
        totalPages={documentsResponse?.meta.totalPages ?? 0}
        onStatusFilterChange={handleStatusFilterChange}
        onUpload={handleUpload}
        onDeleteDocument={handleDeleteDocument}
        onPageChange={setDocumentPage}
      />

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
