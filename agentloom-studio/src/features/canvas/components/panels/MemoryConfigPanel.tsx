import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BrainCircuit, Loader2, X } from 'lucide-react'
import { useAllMemoryInstances } from '@/features/canvas/hooks/useMemoryInstances'
import { Select } from '@/shared/ui/select'
import { Input } from '@/shared/ui/input'

const memoryConfigSchema = z.object({
  memoryInstanceId: z.string().min(1, '此字段为必填项'),
  role: z.enum(['primary', 'readonly']),
  fusionPriority: z.string(),
  bootUris: z.string(),
})

type MemoryConfigFormValues = z.input<typeof memoryConfigSchema>

interface MemoryConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

function isMemoryConfigured(
  config: Record<string, unknown>,
): config is Record<string, unknown> & { memoryInstanceId: string } {
  return typeof config.memoryInstanceId === 'string' && config.memoryInstanceId.length > 0
}

function readBootUris(config: Record<string, unknown>): string[] {
  if (Array.isArray(config.bootUris)) {
    return config.bootUris.filter((u): u is string => typeof u === 'string')
  }
  return ['system://boot']
}

function serializeBootUris(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const BootUriTagInput = memo(function BootUriTagInput({
  value,
  onChange,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const tags = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const [inputValue, setInputValue] = useState('')

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim()
      if (!trimmed) return
      const newTags = [...tags, trimmed]
      onChange(newTags.join(','))
      setInputValue('')
    },
    [tags, onChange],
  )

  const removeTag = useCallback(
    (index: number) => {
      const newTags = tags.filter((_, i) => i !== index)
      onChange(newTags.length > 0 ? newTags.join(',') : '')
    },
    [tags, onChange],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault()
        addTag(inputValue)
      }
      if (event.key === 'Backspace' && !inputValue && tags.length > 0) {
        removeTag(tags.length - 1)
      }
    },
    [addTag, inputValue, removeTag, tags.length],
  )

  return (
    <div className="space-y-2" data-testid="boot-uri-tag-input">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="cursor-pointer rounded-sm text-purple-400 hover:text-purple-200"
              aria-label={`删除 ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) {
            addTag(inputValue)
          }
          onBlur()
        }}
        placeholder="输入 URI 后按 Enter 添加"
        className="text-xs"
        data-testid="boot-uri-input"
      />
    </div>
  )
})

export const MemoryConfigPanel = memo(function MemoryConfigPanel({
  config,
  onApply,
  onValidationChange,
}: MemoryConfigPanelProps) {
  const {
    control,
    reset,
    trigger,
    formState: { errors },
  } = useForm<MemoryConfigFormValues>({
    resolver: zodResolver(memoryConfigSchema),
    defaultValues: {
      memoryInstanceId: isMemoryConfigured(config) ? config.memoryInstanceId : '',
      role: (config.role as 'primary' | 'readonly') ?? 'primary',
      fusionPriority: String(typeof config.fusionPriority === 'number' ? config.fusionPriority : 1),
      bootUris: readBootUris(config).join(','),
    },
    mode: 'onBlur',
  })

  const { data, isLoading } = useAllMemoryInstances()
  const memoryInstances = data ?? []

  const currentId = useWatch({ control, name: 'memoryInstanceId' })
  const currentRole = useWatch({ control, name: 'role' })
  const currentPriority = useWatch({ control, name: 'fusionPriority' })
  const currentBootUris = useWatch({ control, name: 'bootUris' })

  // didMountRef 模式：首次挂载跳过 reset，后续 config 变化时重置表单
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    reset({
      memoryInstanceId: isMemoryConfigured(config) ? config.memoryInstanceId : '',
      role: (config.role as 'primary' | 'readonly') ?? 'primary',
      fusionPriority: String(typeof config.fusionPriority === 'number' ? config.fusionPriority : 1),
      bootUris: readBootUris(config).join(','),
    })
  }, [config, reset])

  // onValidationChange 桥接
  const hasErrors = Object.keys(errors).length > 0
  useEffect(() => {
    onValidationChange?.(hasErrors)
  }, [hasErrors, onValidationChange])

  const buildConfig = useCallback(
    (
      instanceId: string,
      role: string,
      fusionPriority: string,
      bootUris: string,
      instanceName?: string,
    ): Record<string, unknown> => ({
      memoryInstanceId: instanceId,
      memoryInstanceName: instanceName ?? '',
      role,
      fusionPriority: Number(fusionPriority) || 1,
      bootUris: serializeBootUris(bootUris),
    }),
    [],
  )

  const handleInstanceSelect = useCallback(
    (selectedId: string) => {
      if (!selectedId) {
        onApply({
          config: {},
          label: 'Memory',
        })
        return
      }

      const selected = memoryInstances.find((mi) => mi.id === selectedId)
      if (!selected) return

      onApply({
        config: buildConfig(selectedId, currentRole, currentPriority, currentBootUris, selected.name),
        label: selected.name,
      })
    },
    [memoryInstances, onApply, buildConfig, currentRole, currentPriority, currentBootUris],
  )

  const handleFieldChange = useCallback(() => {
    if (!currentId) return
    const selected = memoryInstances.find((mi) => mi.id === currentId)
    onApply({
      config: buildConfig(currentId, currentRole, currentPriority, currentBootUris, selected?.name),
      label: selected?.name ?? 'Memory',
    })
  }, [currentId, memoryInstances, onApply, buildConfig, currentRole, currentPriority, currentBootUris])

  const selectedInstance = memoryInstances.find((mi) => mi.id === currentId)
  const showMissingWarning = Boolean(currentId) && !selectedInstance && !isLoading

  return (
    <div className="space-y-4 px-4 py-4" data-testid="memory-config-panel">
      {/* 头部标签 */}
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-purple-400" />
        <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
          Memory
        </span>
      </div>

      {/* Memory 实例选择器 */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="memory-instance-select">选择 Memory 实例</label>
          <span className="text-error">*</span>
        </span>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : memoryInstances.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No memory instances available. Create one first.
          </p>
        ) : (
          <Controller
            name="memoryInstanceId"
            control={control}
            render={({ field }) => (
              <>
                <Select
                  aria-label="选择 Memory 实例"
                  id="memory-instance-select"
                  value={field.value}
                  onValueChange={(selectedId) => {
                    field.onChange(selectedId)
                    handleInstanceSelect(selectedId)
                    void trigger('memoryInstanceId', { shouldFocus: false })
                  }}
                  onBlur={() => {
                    field.onBlur()
                    void trigger(undefined, { shouldFocus: false })
                  }}
                >
                  <option value="">请选择 Memory 实例</option>
                  {memoryInstances.map((mi) => (
                    <option key={mi.id} value={mi.id}>
                      {mi.name} · {mi.graphEngine}
                    </option>
                  ))}
                </Select>
                {errors.memoryInstanceId && (
                  <p className="mt-1 text-xs text-error">{errors.memoryInstanceId.message}</p>
                )}
              </>
            )}
          />
        )}
      </div>

      {/* Role 选择 */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="memory-role-select">角色</label>
        </span>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <Select
              aria-label="选择角色"
              id="memory-role-select"
              value={field.value}
              onValueChange={(val) => {
                field.onChange(val)
                handleFieldChange()
              }}
              onBlur={() => {
                field.onBlur()
                void trigger(undefined, { shouldFocus: false })
              }}
            >
              <option value="primary">primary（可读写）</option>
              <option value="readonly">readonly（只读）</option>
            </Select>
          )}
        />
      </div>

      {/* Fusion Priority */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="memory-fusion-priority">融合优先级 (1-10)</label>
        </span>
        <Controller
          name="fusionPriority"
          control={control}
          render={({ field }) => (
            <Input
              id="memory-fusion-priority"
              type="number"
              min={1}
              max={10}
              value={field.value}
              onChange={(event) => {
                field.onChange(event.target.value)
                handleFieldChange()
              }}
              onBlur={() => {
                field.onBlur()
                void trigger('fusionPriority', { shouldFocus: false })
              }}
              className="text-xs"
              data-testid="memory-fusion-priority"
            />
          )}
        />
        {errors.fusionPriority && (
          <p className="mt-1 text-xs text-error">{errors.fusionPriority.message}</p>
        )}
      </div>

      {/* Boot URIs */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="memory-boot-uris">Boot URIs</label>
        </span>
        <Controller
          name="bootUris"
          control={control}
          render={({ field }) => (
            <BootUriTagInput
              value={field.value}
              onChange={(val) => {
                field.onChange(val)
                handleFieldChange()
              }}
              onBlur={() => {
                field.onBlur()
                void trigger('bootUris', { shouldFocus: false })
              }}
            />
          )}
        />
      </div>

      {/* 已选实例详情卡片 */}
      {selectedInstance && (
        <div
          className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs"
          data-testid="memory-instance-details"
        >
          <p className="font-medium text-foreground">{selectedInstance.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>引擎: {selectedInstance.graphEngine}</span>
            <span>·</span>
            <span
              className={
                selectedInstance.status === 'active'
                  ? 'text-green-400'
                  : 'text-amber-400'
              }
            >
              {selectedInstance.status}
            </span>
          </div>
          {selectedInstance.description && (
            <p className="text-muted-foreground">{selectedInstance.description}</p>
          )}
          <p className="break-all text-muted">ID: {currentId}</p>
        </div>
      )}

      {/* 缺失实例警告 */}
      {showMissingWarning && (
        <div
          className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
          data-testid="memory-instance-missing-warning"
        >
          <p className="font-medium text-amber-700 dark:text-amber-300">
            当前已选择的 Memory 实例不可用或已删除，请重新选择。
          </p>
          <p className="break-all text-amber-700/80 dark:text-amber-200/80">ID: {currentId}</p>
        </div>
      )}
    </div>
  )
})
