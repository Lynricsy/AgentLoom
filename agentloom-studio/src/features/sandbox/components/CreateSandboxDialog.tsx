import { useState, type ChangeEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useCreateSandbox } from '../api/sandboxMutations'
import { useToast } from '@/shared/ui/toast'
import { normalizeSandboxConversationIdleAutoEndMinutes } from '@/shared/lib/sandboxConversationIdleAutoEnd'
import { SandboxPresetSelector } from './SandboxPresetSelector'
import {
  useSandboxPresetStore,
  type SandboxPreset,
} from '../stores/sandboxPresetStore'
import type { SandboxSession } from '../types'

interface CreateSandboxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (sandbox: SandboxSession) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function CreateSandboxDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSandboxDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreateSandbox()

  const [name, setName] = useState('')
  const [cpu, setCpu] = useState(1)
  const [memory, setMemory] = useState(512)
  const [disk, setDisk] = useState(2)
  const [conversationIdleAutoEndMinutes, setConversationIdleAutoEndMinutes] = useState(
    normalizeSandboxConversationIdleAutoEndMinutes(undefined),
  )
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(undefined)

  const addPreset = useSandboxPresetStore((s) => s.addPreset)
  const currentConfig = { cpu, memory, disk }

  function handlePresetSelect(preset: SandboxPreset) {
    setCpu(preset.cpu)
    setMemory(preset.memory)
    setDisk(preset.disk)
    setSelectedPresetId(preset.id)
  }

  function handleSaveAsPreset(preset: { name: string; cpu: number; memory: number; disk: number }) {
    addPreset(preset)
  }

  function clearPresetSelection() {
    setSelectedPresetId(undefined)
  }

  function resetForm() {
    setName('')
    setCpu(1)
    setMemory(512)
    setDisk(2)
    setConversationIdleAutoEndMinutes(
      normalizeSandboxConversationIdleAutoEndMinutes(undefined),
    )
    setSelectedPresetId(undefined)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function handleCreate() {
    if (!name.trim()) return

    createMutation.mutate(
      {
        name: name.trim(),
        cpu,
        memory,
        disk,
        conversationIdleAutoEndMinutes,
      },
      {
        onSuccess: (sandbox) => {
          onCreated?.(sandbox)
          notify({
            title: '已创建',
            description: `沙箱「${name.trim()}」已成功创建。`,
            variant: 'success',
          })
          handleOpenChange(false)
        },
        onError: (err) => {
          notify({
            title: '创建失败',
            description: err instanceof Error ? err.message : '请稍后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  const canCreate = name.trim().length > 0 && !createMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              创建持久沙箱
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            创建新的持久化沙箱环境
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">
            {/* Preset Selector */}
            <SandboxPresetSelector
              selectedPresetId={selectedPresetId}
              onSelect={handlePresetSelect}
              onSaveAsPreset={handleSaveAsPreset}
              currentConfig={currentConfig}
            />

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="sandbox-name">
                名称 <span className="text-red-400">*</span>
              </label>
              <Input
                id="sandbox-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="沙箱名称"
              />
            </div>

            {/* CPU */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="sandbox-cpu-slider" className="text-sm font-medium text-foreground">
                  CPU
                </label>
                <span className="text-sm text-muted-foreground">{cpu} 核</span>
              </div>
              <input
                id="sandbox-cpu-slider"
                type="range"
                min={0.5}
                max={4}
                step={0.5}
                value={cpu}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setCpu(clamp(Number(e.target.value), 0.5, 4))
                  clearPresetSelection()
                }}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0.5 核</span>
                <span>4 核</span>
              </div>
            </div>

            {/* Memory */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="sandbox-memory-slider" className="text-sm font-medium text-foreground">
                  Memory
                </label>
                <span className="text-sm text-muted-foreground">{memory} MB</span>
              </div>
              <input
                id="sandbox-memory-slider"
                type="range"
                min={256}
                max={4096}
                step={256}
                value={memory}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setMemory(clamp(Number(e.target.value), 256, 4096))
                  clearPresetSelection()
                }}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>256 MB</span>
                <span>4096 MB</span>
              </div>
            </div>

            {/* Disk */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="sandbox-disk-slider" className="text-sm font-medium text-foreground">
                  Disk
                </label>
                <span className="text-sm text-muted-foreground">{disk} GB</span>
              </div>
              <input
                id="sandbox-disk-slider"
                type="range"
                min={1}
                max={10}
                step={1}
                value={disk}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setDisk(clamp(Number(e.target.value), 1, 10))
                  clearPresetSelection()
                }}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1 GB</span>
                <span>10 GB</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="sandbox-conversation-idle-auto-end-minutes"
              >
                对话空闲自动结束（分钟）
              </label>
              <Input
                id="sandbox-conversation-idle-auto-end-minutes"
                type="number"
                min={1}
                max={1440}
                value={conversationIdleAutoEndMinutes}
                onChange={(e) =>
                  setConversationIdleAutoEndMinutes(
                    normalizeSandboxConversationIdleAutoEndMinutes(
                      Number(e.target.value),
                    ),
                  )
                }
              />
              <p className="text-xs leading-5 text-muted-foreground">
                沙箱里没有运行中的对话，且所有对话都空闲后，会按该分钟数自动结束对话。
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button disabled={!canCreate} onClick={handleCreate}>
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              创建
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
