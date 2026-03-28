import { memo, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, X, Plus } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  useSandboxPresetStore,
  getAllPresets,
  findMatchingPreset,
  type SandboxPreset,
} from '../stores/sandboxPresetStore'

interface SandboxPresetSelectorProps {
  selectedPresetId?: string
  onSelect: (preset: SandboxPreset) => void
  onSaveAsPreset?: (config: { cpu: number; memory: number; disk: number }) => void
  currentConfig?: { cpu: number; memory: number; disk: number }
  compact?: boolean
}

const PresetCard = memo(function PresetCard({
  preset,
  isSelected,
  onSelect,
  onRemove,
  compact,
}: {
  preset: SandboxPreset
  isSelected: boolean
  onSelect: () => void
  onRemove?: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col rounded-lg border px-3 text-left transition-colors',
        compact ? 'gap-0.5 py-2' : 'gap-1 py-2.5',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-surface-elevated hover:border-primary/50',
      )}
    >
      <span
        className={cn(
          'text-xs font-medium',
          isSelected ? 'text-primary' : 'text-foreground',
        )}
      >
        {preset.name}
        {preset.isBuiltin && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            (内置)
          </span>
        )}
      </span>

      <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Cpu className="h-2.5 w-2.5" />
          {preset.cpu}核
        </span>
        <span className="inline-flex items-center gap-0.5">
          <MemoryStick className="h-2.5 w-2.5" />
          {preset.memory}MB
        </span>
        <span className="inline-flex items-center gap-0.5">
          <HardDrive className="h-2.5 w-2.5" />
          {preset.disk}GB
        </span>
      </span>

      {!preset.isBuiltin && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-surface-elevated p-0.5 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground group-hover:block"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </button>
  )
})

export const SandboxPresetSelector = memo(function SandboxPresetSelector({
  selectedPresetId,
  onSelect,
  onSaveAsPreset,
  currentConfig,
  compact = false,
}: SandboxPresetSelectorProps) {
  const customPresets = useSandboxPresetStore((s) => s.customPresets)
  const removePreset = useSandboxPresetStore((s) => s.removePreset)
  const allPresets = getAllPresets(customPresets)

  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  // Determine if current config matches any preset
  const matchedPreset = currentConfig
    ? findMatchingPreset(allPresets, currentConfig)
    : undefined
  const activePresetId = selectedPresetId ?? matchedPreset?.id
  const canSave = currentConfig && !matchedPreset && onSaveAsPreset

  function handleSavePreset() {
    if (!newPresetName.trim() || !currentConfig || !onSaveAsPreset) return
    onSaveAsPreset(currentConfig)
    setNewPresetName('')
    setShowSaveForm(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
          配置预设
        </label>
        {canSave && !showSaveForm && (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary/80"
          >
            <Plus className="h-3 w-3" />
            保存为预设
          </button>
        )}
      </div>

      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        {allPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={activePresetId === preset.id}
            onSelect={() => onSelect(preset)}
            onRemove={!preset.isBuiltin ? () => removePreset(preset.id) : undefined}
            compact={compact}
          />
        ))}
      </div>

      {showSaveForm && (
        <div className="flex items-center gap-2">
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="预设名称"
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSavePreset()
              if (e.key === 'Escape') setShowSaveForm(false)
            }}
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSavePreset} disabled={!newPresetName.trim()}>
            保存
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setShowSaveForm(false)
              setNewPresetName('')
            }}
          >
            取消
          </Button>
        </div>
      )}
    </div>
  )
})
