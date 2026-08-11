import { useCallback, useRef, useState, type DragEvent } from 'react'
import { FileArchive, ShieldAlert, Upload, X } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Progress } from '@/shared/ui/progress'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { useToast } from '@/shared/ui/toast'
import { cn } from '@/shared/lib/utils'
import { useRegisterPlugin } from '../api/pluginMutations'
import { PLUGIN_PACKAGE_EXTENSION, isPluginPackageFile } from '../api/pluginApi'

interface RegisterPluginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const BYTES_PER_MB = 1024 * 1024

export function RegisterPluginDialog({ open, onOpenChange }: RegisterPluginDialogProps) {
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [activateNow, setActivateNow] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const registerMutation = useRegisterPlugin()
  const isUploading = registerMutation.isPending

  const acceptFile = useCallback((candidate: File | undefined) => {
    if (!candidate) return

    if (!isPluginPackageFile(candidate)) {
      setFile(null)
      setError(
        `「${candidate.name}」不是插件包，请选择以 ${PLUGIN_PACKAGE_EXTENSION} 结尾的文件。`,
      )
      return
    }

    setError(null)
    setProgress(0)
    setFile(candidate)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (isUploading) return
      acceptFile(event.dataTransfer.files[0])
    },
    [acceptFile, isUploading],
  )

  const reset = useCallback(() => {
    setFile(null)
    setActivateNow(false)
    setProgress(0)
    setError(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (isUploading) return
      if (!next) reset()
      onOpenChange(next)
    },
    [isUploading, onOpenChange, reset],
  )

  const handleSubmit = useCallback(() => {
    if (!file) return

    setError(null)
    setProgress(0)

    registerMutation.mutate(
      {
        file,
        ...(activateNow ? { status: 'active' as const } : null),
        onProgress: setProgress,
      },
      {
        onSuccess: (plugin) => {
          notify({
            title: '插件已注册',
            description: `「${plugin.name}」v${plugin.version} 已加入插件库。`,
            variant: 'success',
          })
          reset()
          onOpenChange(false)
        },
        onError: (mutationError) => {
          setProgress(0)
          setError(
            mutationError instanceof Error
              ? mutationError.message
              : '插件注册失败，请稍后重试。',
          )
        },
      },
    )
  }, [activateNow, file, notify, onOpenChange, registerMutation, reset])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>注册插件</DialogTitle>
          <DialogDescription>
            上传由开发者密钥签名的 {PLUGIN_PACKAGE_EXTENSION} 插件包，服务端会校验签名后入库。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div
            data-testid="plugin-dropzone"
            onDragOver={(event) => {
              event.preventDefault()
              if (!isUploading) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center gap-2 rounded-panel border border-dashed px-6 py-8 text-center transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-border bg-surface-elevated/40',
              isUploading && 'opacity-60',
            )}
          >
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary"
            >
              {file ? <FileArchive className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            </span>

            {file ? (
              <div className="flex max-w-full items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {file.size >= BYTES_PER_MB
                    ? `${(file.size / BYTES_PER_MB).toFixed(1)} MB`
                    : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                </span>
                {isUploading ? null : (
                  <button
                    type="button"
                    aria-label="移除已选文件"
                    onClick={() => {
                      setFile(null)
                      setProgress(0)
                    }}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground">
                把插件包拖到这里，或
                <button
                  type="button"
                  className="mx-1 text-primary underline-offset-2 hover:underline"
                  onClick={() => inputRef.current?.click()}
                >
                  选择文件
                </button>
              </p>
            )}

            <p className="text-xs text-muted">仅支持 {PLUGIN_PACKAGE_EXTENSION} 插件包</p>

            <input
              ref={inputRef}
              type="file"
              accept={PLUGIN_PACKAGE_EXTENSION}
              data-testid="plugin-file-input"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {isUploading ? (
            <div className="space-y-1.5" data-testid="plugin-upload-progress">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Spinner size="sm" />
                  {progress >= 100 ? '正在校验签名…' : '正在上传…'}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} aria-label="插件上传进度" />
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-card border border-error/25 bg-error/10 px-3 py-2 text-xs text-error"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={activateNow}
              disabled={isUploading}
              onCheckedChange={(checked) => setActivateNow(checked === true)}
            />
            <span>
              注册后立即启用
              <span className="mt-0.5 block text-xs text-muted">
                启用后该插件的节点会出现在画布节点面板中。
              </span>
            </span>
          </label>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" disabled={isUploading} onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!file || isUploading} onClick={handleSubmit}>
            {isUploading ? '上传中…' : '上传并注册'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
