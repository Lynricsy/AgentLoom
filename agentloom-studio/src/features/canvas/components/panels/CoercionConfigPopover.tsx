import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Check, Settings2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import type { CoercionStrategy, PortDataType, TypeCoercionConfig } from '../../types'
import { getAvailableStrategies, getStrategyLabel } from '../../lib/coercionStrategies'

export interface CoercionConfigPopoverProps {
  sourceType: PortDataType
  targetType: PortDataType
  value?: TypeCoercionConfig
  onChange?: (config: TypeCoercionConfig | undefined) => void
  /**
   * 'inline' — 旧行为：选择后立即 onChange
   * 'confirm' — 选择后需要确认/取消才提交
   */
  mode?: 'inline' | 'confirm'
  /** 控制初始打开状态（例如 coercible 类型不匹配时自动打开） */
  defaultOpen?: boolean
  /** confirm 模式下用户确认回调 */
  onConfirm?: (config: TypeCoercionConfig) => void
  /** confirm 模式下用户取消回调 */
  onCancel?: () => void
}

export const CoercionConfigPopover = memo(function CoercionConfigPopover({
  sourceType,
  targetType,
  value,
  onChange,
  mode = 'inline',
  defaultOpen = false,
  onConfirm,
  onCancel,
}: CoercionConfigPopoverProps) {
  const [open, setOpen] = useState(defaultOpen)
  const strategies = getAvailableStrategies(sourceType, targetType)
  const cancellingRef = useRef(false)

  const [stagedConfig, setStagedConfig] = useState<TypeCoercionConfig | undefined>(value)

  useEffect(() => {
    if (!open) {
      setStagedConfig(value)
    }
  }, [value, open])

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true)
    }
  }, [defaultOpen])

  const handleSelect = useCallback(
    (strategy: CoercionStrategy) => {
      if (mode === 'confirm') {
        if (stagedConfig?.strategy === strategy) return
        const defaultParams = getDefaultParams(strategy)
        setStagedConfig({ strategy, ...(defaultParams ? { params: defaultParams } : {}) })
      } else {
        if (value?.strategy === strategy) return
        const defaultParams = getDefaultParams(strategy)
        onChange?.({ strategy, ...(defaultParams ? { params: defaultParams } : {}) })
      }
    },
    [mode, onChange, value, stagedConfig],
  )

  const handleClear = useCallback(() => {
    if (mode === 'confirm') {
      setStagedConfig(undefined)
    } else {
      onChange?.(undefined)
      setOpen(false)
    }
  }, [mode, onChange])

  const handleParamChange = useCallback(
    (params: Record<string, unknown>) => {
      if (mode === 'confirm') {
        if (!stagedConfig) return
        setStagedConfig({ ...stagedConfig, params })
      } else {
        if (!value) return
        onChange?.({ ...value, params })
      }
    },
    [mode, value, stagedConfig, onChange],
  )

  const handleConfirm = useCallback(() => {
    if (stagedConfig) {
      onChange?.(stagedConfig)
      onConfirm?.(stagedConfig)
    }
    setOpen(false)
  }, [stagedConfig, onChange, onConfirm])

  const handleCancel = useCallback(() => {
    if (cancellingRef.current) return
    cancellingRef.current = true
    setStagedConfig(value)
    onCancel?.()
    setOpen(false)
    queueMicrotask(() => { cancellingRef.current = false })
  }, [value, onCancel])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && mode === 'confirm') {
        handleCancel()
        return
      }
      setOpen(nextOpen)
    },
    [mode, handleCancel],
  )

  if (strategies.length === 0) return null

  const activeConfig = mode === 'confirm' ? stagedConfig : value

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          data-testid="coercion-config-trigger"
          className={value ? 'text-warning' : 'text-muted-foreground'}
          aria-label="配置类型转换"
        >
          <Settings2 />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        data-testid="coercion-config-popover"
        className="w-64 space-y-2 p-3"
        sideOffset={4}
        align="start"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">类型转换</span>
          <span className="truncate font-mono text-2xs text-muted-foreground">
            {sourceType} → {targetType}
          </span>
        </div>

        <div className="flex flex-col gap-0.5" role="listbox" aria-label="转换策略">
          {strategies.map((strategy) => (
            <Button
              key={strategy}
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={activeConfig?.strategy === strategy}
              data-testid={`coercion-strategy-${strategy}`}
              className={cn(
                'justify-start font-normal',
                activeConfig?.strategy === strategy &&
                  'bg-primary/10 font-medium text-primary hover:bg-primary/15',
              )}
              onClick={() => handleSelect(strategy)}
            >
              {getStrategyLabel(strategy)}
            </Button>
          ))}
        </div>

        {activeConfig && hasParams(activeConfig.strategy) && (
          <CoercionParamsInput
            strategy={activeConfig.strategy}
            params={activeConfig.params}
            onChange={handleParamChange}
          />
        )}

        {mode === 'confirm' ? (
          <div className="flex gap-2 pt-1" data-testid="coercion-confirm-actions">
            <Button
              size="sm"
              data-testid="coercion-confirm-btn"
              className="flex-1"
              onClick={handleConfirm}
              disabled={!stagedConfig}
              aria-label="确认转换配置"
            >
              <Check />
              <span>确认</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="coercion-cancel-btn"
              className="flex-1"
              onClick={handleCancel}
              aria-label="取消转换配置"
            >
              <X />
              <span>取消</span>
            </Button>
          </div>
        ) : (
          activeConfig && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="coercion-clear"
              className="w-full hover:bg-error/10 hover:text-error"
              onClick={handleClear}
            >
              清除转换
            </Button>
          )
        )}
      </PopoverContent>
    </Popover>
  )
})

interface CoercionParamsInputProps {
  strategy: CoercionStrategy
  params?: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

function CoercionParamsInput({ strategy, params, onChange }: CoercionParamsInputProps) {
  if (strategy === 'toFixed') {
    const precision = (params?.precision as number) ?? 2
    return (
      <div className="space-y-1.5" data-testid="coercion-param-toFixed">
        <label htmlFor="coercion-precision">
          <Label>精度</Label>
        </label>
        <Input
          id="coercion-precision"
          data-testid="coercion-precision-input"
          type="number"
          min={0}
          max={20}
          value={precision}
          onChange={(e) => onChange({ ...params, precision: Number(e.target.value) })}
          className="h-8"
        />
      </div>
    )
  }

  if (strategy === 'join') {
    const separator = (params?.separator as string) ?? ','
    return (
      <div className="space-y-1.5" data-testid="coercion-param-join">
        <label htmlFor="coercion-separator">
          <Label>分隔符</Label>
        </label>
        <Input
          id="coercion-separator"
          data-testid="coercion-separator-input"
          type="text"
          value={separator}
          onChange={(e) => onChange({ ...params, separator: e.target.value })}
          className="h-8"
        />
      </div>
    )
  }

  return null
}

function hasParams(strategy: CoercionStrategy): boolean {
  return strategy === 'toFixed' || strategy === 'join'
}

function getDefaultParams(strategy: CoercionStrategy): Record<string, unknown> | undefined {
  if (strategy === 'toFixed') return { precision: 2 }
  if (strategy === 'join') return { separator: ',' }
  return undefined
}
