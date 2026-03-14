import { memo, useCallback, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Settings2 } from 'lucide-react'
import type { CoercionStrategy, PortDataType, TypeCoercionConfig } from '../../types'
import { getAvailableStrategies, getStrategyLabel } from '../../lib/coercionStrategies'

export interface CoercionConfigPopoverProps {
  sourceType: PortDataType
  targetType: PortDataType
  value?: TypeCoercionConfig
  onChange: (config: TypeCoercionConfig | undefined) => void
}

export const CoercionConfigPopover = memo(function CoercionConfigPopover({
  sourceType,
  targetType,
  value,
  onChange,
}: CoercionConfigPopoverProps) {
  const [open, setOpen] = useState(false)
  const strategies = getAvailableStrategies(sourceType, targetType)

  const handleSelect = useCallback(
    (strategy: CoercionStrategy) => {
      const defaultParams = getDefaultParams(strategy)
      onChange({ strategy, ...(defaultParams ? { params: defaultParams } : {}) })
    },
    [onChange],
  )

  const handleClear = useCallback(() => {
    onChange(undefined)
    setOpen(false)
  }, [onChange])

  const handleParamChange = useCallback(
    (params: Record<string, unknown>) => {
      if (!value) return
      onChange({ ...value, params })
    },
    [value, onChange],
  )

  if (strategies.length === 0) return null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
                aria-selected={value?.strategy === strategy}
                data-testid={`coercion-strategy-${strategy}`}
                className={`coercion-strategy-item${value?.strategy === strategy ? ' coercion-strategy-item--selected' : ''}`}
                onClick={() => handleSelect(strategy)}
              >
                {getStrategyLabel(strategy)}
              </button>
            ))}
          </div>

          {value && hasParams(value.strategy) && (
            <CoercionParamsInput
              strategy={value.strategy}
              params={value.params}
              onChange={handleParamChange}
            />
          )}

          {value && (
            <button
              type="button"
              data-testid="coercion-clear"
              className="coercion-clear-btn"
              onClick={handleClear}
            >
              清除转换
            </button>
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
