import { memo, useCallback, useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, Settings2, X } from 'lucide-react'
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
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="coercion-config-trigger"
          className={`coercion-trigger${value ? ' coercion-trigger--active' : ''}`}
          aria-label="Configure type coercion"
        >
          <Settings2 size={14} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          data-testid="coercion-config-popover"
          className="coercion-popover"
          sideOffset={4}
          align="start"
        >
          <div className="coercion-popover-header">
            <span className="coercion-popover-title">类型转换</span>
            <span className="coercion-popover-types">
              {sourceType} → {targetType}
            </span>
          </div>

          <div className="coercion-strategy-list" role="listbox" aria-label="Coercion strategies">
            {strategies.map((strategy) => (
              <button
                key={strategy}
                type="button"
                role="option"
                aria-selected={activeConfig?.strategy === strategy}
                data-testid={`coercion-strategy-${strategy}`}
                className={`coercion-strategy-item${activeConfig?.strategy === strategy ? ' coercion-strategy-item--selected' : ''}`}
                onClick={() => handleSelect(strategy)}
              >
                {getStrategyLabel(strategy)}
              </button>
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
            <div className="coercion-confirm-actions" data-testid="coercion-confirm-actions">
              <button
                type="button"
                data-testid="coercion-confirm-btn"
                className="coercion-confirm-btn"
                onClick={handleConfirm}
                disabled={!stagedConfig}
                aria-label="确认转换配置"
              >
                <Check size={14} />
                <span>确认</span>
              </button>
              <button
                type="button"
                data-testid="coercion-cancel-btn"
                className="coercion-cancel-btn"
                onClick={handleCancel}
                aria-label="取消转换配置"
              >
                <X size={14} />
                <span>取消</span>
              </button>
            </div>
          ) : (
            activeConfig && (
              <button
                type="button"
                data-testid="coercion-clear"
                className="coercion-clear-btn"
                onClick={handleClear}
              >
                清除转换
              </button>
            )
          )}

          <Popover.Arrow className="coercion-popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
      <div className="coercion-param" data-testid="coercion-param-toFixed">
        <label htmlFor="coercion-precision">精度</label>
        <input
          id="coercion-precision"
          data-testid="coercion-precision-input"
          type="number"
          min={0}
          max={20}
          value={precision}
          onChange={(e) => onChange({ ...params, precision: Number(e.target.value) })}
          className="coercion-param-input"
        />
      </div>
    )
  }

  if (strategy === 'join') {
    const separator = (params?.separator as string) ?? ','
    return (
      <div className="coercion-param" data-testid="coercion-param-join">
        <label htmlFor="coercion-separator">分隔符</label>
        <input
          id="coercion-separator"
          data-testid="coercion-separator-input"
          type="text"
          value={separator}
          onChange={(e) => onChange({ ...params, separator: e.target.value })}
          className="coercion-param-input"
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
