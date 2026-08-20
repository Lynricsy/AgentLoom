import type { Dispatch, SetStateAction } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { LlmModelInfo } from '@/features/llm'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  CHUNKING_STRATEGY_OPTIONS,
  QUERY_ORCHESTRATION_OPTIONS,
  RERANKER_OPTIONS,
  USE_DEFAULT_MODEL,
  createDefaultSettings,
  type KnowledgeBaseSettingsDraft,
} from '../lib/knowledgeBaseDetail'
import type {
  KnowledgeChunkingStrategy,
  KnowledgeQueryOrchestration,
  KnowledgeRerankingStrategy,
  KnowledgeRetrievalStrategy,
} from '../types'

export interface KnowledgeBaseSettingsFormProps {
  settings: KnowledgeBaseSettingsDraft
  setSettings: Dispatch<SetStateAction<KnowledgeBaseSettingsDraft>>
  embeddingModels: LlmModelInfo[]
  chatModels: LlmModelInfo[]
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
}

/** 单个知识库的分块 / 检索 / 重排 / query orchestration 策略表单 */
export function KnowledgeBaseSettingsForm({
  settings,
  setSettings,
  embeddingModels,
  chatModels,
  isDirty,
  isSaving,
  onSave,
}: KnowledgeBaseSettingsFormProps) {
  const defaultSettings = createDefaultSettings()
  const chunkingStrategy = settings.chunkingStrategy ?? defaultSettings.chunkingStrategy
  const retrievalStrategy = settings.retrievalStrategy ?? defaultSettings.retrievalStrategy
  const rerankingStrategy = settings.rerankingStrategy ?? defaultSettings.rerankingStrategy
  const queryOrchestration = settings.queryOrchestration ?? defaultSettings.queryOrchestration

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">检索策略</h2>
          <p className="text-sm text-muted">
            每个知识库独立定义分块、检索、重排与 query orchestration。
          </p>
        </div>
        <Button onClick={onSave} disabled={isSaving || !isDirty}>
          {isSaving ? (
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
  )
}
