import { useCallback, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useValidateImport, useImportWorkflow } from '../api/workflowMutations'
import { parseImportFile } from '../lib/workflowExportImport'
import type { WorkflowExportEnvelope } from '../types'

interface WorkflowImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportStep = 'upload' | 'preview'

export function WorkflowImportDialog({ open, onOpenChange }: WorkflowImportDialogProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('upload')
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsedContent, setParsedContent] = useState<WorkflowExportEnvelope | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [importName, setImportName] = useState('')
  const [importDescription, setImportDescription] = useState('')

  const validateMutation = useValidateImport()
  const importMutation = useImportWorkflow()

  const resetState = useCallback(() => {
    setStep('upload')
    setFileError(null)
    setParsedContent(null)
    setValidationErrors([])
    setNodeCount(0)
    setEdgeCount(0)
    setImportName('')
    setImportDescription('')
    validateMutation.reset()
    importMutation.reset()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [validateMutation, importMutation])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetState()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetState],
  )

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setFileError(null)
      setValidationErrors([])

      try {
        const text = await parseImportFile(file)
        let content: WorkflowExportEnvelope
        try {
          content = JSON.parse(text) as WorkflowExportEnvelope
        } catch {
          setFileError('文件内容不是有效的 JSON 格式')
          return
        }

        setParsedContent(content)

        const result = await validateMutation.mutateAsync(content)

        if (result.valid) {
          setNodeCount(result.nodeCount ?? 0)
          setEdgeCount(result.edgeCount ?? 0)
          setImportName(content.workflow?.name ? `${content.workflow.name} 的副本` : '')
          setImportDescription(content.workflow?.description ?? '')
          setStep('preview')
        } else {
          setValidationErrors(result.errors)
        }
      } catch (err) {
        setFileError(err instanceof Error ? err.message : '读取文件时发生错误')
      }
    },
    [validateMutation],
  )

  const handleImport = useCallback(async () => {
    if (!parsedContent || !importName.trim()) return

    try {
      const result = await importMutation.mutateAsync({
        name: importName.trim(),
        description: importDescription.trim() || undefined,
        fileContent: parsedContent,
      })

      handleOpenChange(false)
      navigate({ to: '/workflows/$workflowId', params: { workflowId: result.id } })
    } catch {
    }
  }, [parsedContent, importName, importDescription, importMutation, handleOpenChange, navigate])

  const handleClickUploadZone = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const isValidating = validateMutation.isPending
  const isImporting = importMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Title className="text-base font-semibold text-foreground">
            导入工作流
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {step === 'upload'
              ? '上传工作流导出文件以创建新的工作流'
              : '确认导入信息'}
          </Dialog.Description>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          {step === 'upload' && (
            <div className="mt-4 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.agentloom-workflow.json"
                className="hidden"
                onChange={handleFileSelected}
                data-testid="import-file-input"
              />

              <button
                type="button"
                onClick={handleClickUploadZone}
                disabled={isValidating}
                className={cn(
                  'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  isValidating
                    ? 'cursor-wait border-muted bg-muted/30'
                    : 'cursor-pointer border-border hover:border-primary/40 hover:bg-muted/30',
                )}
                data-testid="import-upload-zone"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">验证中...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      点击选择文件或拖拽文件到此处
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      支持 .json 和 .agentloom-workflow.json
                    </span>
                  </>
                )}
              </button>

              {fileError && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    文件校验失败
                  </div>
                  <ul className="ml-6 list-disc space-y-0.5 text-xs text-red-400/80">
                    {validationErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && parsedContent && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                文件校验通过
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-lg font-semibold text-foreground">{nodeCount}</div>
                  <div className="text-xs text-muted-foreground">节点</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-lg font-semibold text-foreground">{edgeCount}</div>
                  <div className="text-xs text-muted-foreground">连线</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-lg font-semibold text-foreground">
                    {parsedContent.schemaVersion}
                  </div>
                  <div className="text-xs text-muted-foreground">版本</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="import-name"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    工作流名称
                  </label>
                  <input
                    id="import-name"
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="输入工作流名称"
                    data-testid="import-name-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="import-description"
                    className="mb-1 block text-sm font-medium text-foreground"
                  >
                    描述（可选）
                  </label>
                  <textarea
                    id="import-description"
                    value={importDescription}
                    onChange={(e) => setImportDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="输入工作流描述"
                    data-testid="import-description-input"
                  />
                </div>
              </div>

              {importMutation.error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {importMutation.error instanceof Error
                      ? importMutation.error.message
                      : '导入失败，请重试'}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetState}
                  disabled={isImporting}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                >
                  重新选择
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting || !importName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  data-testid="btn-confirm-import"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    '导入'
                  )}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
