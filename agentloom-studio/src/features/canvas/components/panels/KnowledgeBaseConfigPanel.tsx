import { memo, useCallback, useEffect, useRef } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpen, Loader2 } from 'lucide-react'
import {
  buildKnowledgeBaseNodeConfig,
  getKnowledgeBaseStatusLabel,
  isKnowledgeBaseConfigured,
} from '@/features/knowledge/types'
import { useAllKnowledgeBases } from '@/features/knowledge/hooks/useKnowledgeBases'
import { Select } from '@/shared/ui/select'

const knowledgeBaseSchema = z.object({
  knowledgeBaseId: z.string().min(1, '此字段为必填项'),
})

type KnowledgeBaseFormValues = z.infer<typeof knowledgeBaseSchema>

interface KnowledgeBaseConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

export const KnowledgeBaseConfigPanel = memo(
  function KnowledgeBaseConfigPanel({
    config,
    onApply,
    onValidationChange,
  }: KnowledgeBaseConfigPanelProps) {
    const {
      control,
      reset,
      trigger,
      formState: { errors },
    } = useForm<KnowledgeBaseFormValues>({
      resolver: zodResolver(knowledgeBaseSchema),
      defaultValues: {
        knowledgeBaseId: isKnowledgeBaseConfigured(config)
          ? config.knowledgeBaseId
          : '',
      },
      mode: 'onBlur',
    })
    const { data, isLoading } = useAllKnowledgeBases()
    const knowledgeBases = data ?? []

    const currentId = useWatch({
      control,
      name: 'knowledgeBaseId',
    })

    const didMountRef = useRef(false)
    useEffect(() => {
      if (!didMountRef.current) {
        didMountRef.current = true
        return
      }

      reset({
        knowledgeBaseId: isKnowledgeBaseConfigured(config)
          ? config.knowledgeBaseId
          : '',
      })
    }, [config, reset])

    const hasErrors = Object.keys(errors).length > 0
    useEffect(() => {
      onValidationChange?.(hasErrors)
    }, [hasErrors, onValidationChange])

    const handleSelect = useCallback(
      (selectedId: string) => {
        if (!selectedId) {
          onApply({
            config: {},
            label: '知识库',
          })
          return
        }

        const selectedKb = knowledgeBases.find((kb) => kb.id === selectedId)

        if (!selectedKb) {
          return
        }

        onApply({
          config: buildKnowledgeBaseNodeConfig(selectedKb),
          label: selectedKb.name,
        })
      },
      [knowledgeBases, onApply],
    )

    const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === currentId)
    const showMissingKnowledgeBaseWarning =
      Boolean(currentId) && !selectedKnowledgeBase && !isLoading

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-type-knowledge" />
          <span className="rounded-full bg-type-knowledge/10 px-2 py-0.5 text-xs font-medium text-type-knowledge">
            知识库
          </span>
        </div>

        <div>
          <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <label htmlFor="kb-select">选择知识库</label>
            <span className="text-error">*</span>
          </span>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : (
            <Controller
              name="knowledgeBaseId"
              control={control}
              render={({ field }) => (
                <>
                  <Select
                    aria-label="选择知识库"
                    id="kb-select"
                    value={field.value}
                    onValueChange={(selectedId) => {
                      field.onChange(selectedId)
                      handleSelect(selectedId)
                      void trigger('knowledgeBaseId', { shouldFocus: false })
                    }}
                    onBlur={() => {
                      field.onBlur()
                      void trigger(undefined, { shouldFocus: false })
                    }}
                  >
                    <option value="">请选择知识库</option>
                    {knowledgeBases.map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name} · {kb.documentCount} 文档
                      </option>
                    ))}
                  </Select>
                  {errors.knowledgeBaseId && (
                    <p className="mt-1 text-xs text-error">
                      {errors.knowledgeBaseId.message}
                    </p>
                  )}
                </>
              )}
            />
          )}
        </div>

        {selectedKnowledgeBase && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            <p className="font-medium text-foreground">
              {selectedKnowledgeBase.name}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{selectedKnowledgeBase.documentCount} 个文档</span>
              <span>·</span>
              <span>{selectedKnowledgeBase.chunkCount} 个分块</span>
              <span>·</span>
              <span>{getKnowledgeBaseStatusLabel(selectedKnowledgeBase.status)}</span>
            </div>
            <p className="break-all text-muted">ID: {currentId}</p>
          </div>
        )}

        {showMissingKnowledgeBaseWarning && (
          <div
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
            data-testid="knowledge-base-missing-warning"
          >
            <p className="font-medium text-amber-700 dark:text-amber-300">
              当前已选择的知识库不可用或已删除，请重新选择。
            </p>
            <p className="break-all text-amber-700/80 dark:text-amber-200/80">
              ID: {currentId}
            </p>
          </div>
        )}
      </div>
    )
  },
)
