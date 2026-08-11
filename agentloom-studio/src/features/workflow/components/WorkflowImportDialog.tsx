import { useCallback, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { useValidateImport, useImportWorkflow } from '../api/workflowMutations'
import { parseImportFile } from '../lib/workflowExportImport'
import type { WorkflowImportFileContent } from '../types'

interface WorkflowImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportStep = 'upload' | 'preview'

function getImportSchemaVersion(content: WorkflowImportFileContent): string {
  return content.schemaVersion ?? content.schema_version ?? '未知'
}

export function WorkflowImportDialog({ open, onOpenChange }: WorkflowImportDialogProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('upload')
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsedContent, setParsedContent] = useState<WorkflowImportFileContent | null>(null)
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
        let content: WorkflowImportFileContent
        try {
          content = JSON.parse(text) as WorkflowImportFileContent
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>导入工作流</DialogTitle>
          <DialogDescription>
            {step === 'upload'
              ? '上传工作流导出文件以创建新的工作流'
              : '确认导入信息'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <DialogBody className="space-y-3">
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
                'flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed p-8 text-center transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isValidating
                  ? 'cursor-wait border-border bg-surface-elevated'
                  : 'cursor-pointer border-border hover:border-primary hover:bg-surface-elevated',
              )}
              data-testid="import-upload-zone"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted" />
                  <span className="text-sm text-muted">验证中...</span>
                </>
              ) : (
                <>
                  <FileUp className="h-8 w-8 text-muted" />
                  <span className="text-sm text-foreground">
                    点击选择文件或拖拽文件到此处
                  </span>
                  <span className="text-xs text-muted">
                    支持 .json 和 .agentloom-workflow.json
                  </span>
                </>
              )}
            </button>

            {fileError && (
              <div className="flex items-start gap-2 rounded-card border border-error/25 bg-error/10 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="space-y-1.5 rounded-card border border-error/25 bg-error/10 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  文件校验失败
                </div>
                <ul className="ml-6 list-disc space-y-0.5 text-xs text-error">
                  {validationErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </DialogBody>
        )}

        {step === 'preview' && parsedContent && (
          <>
            <DialogBody className="space-y-4">
              <div className="flex items-center gap-2 rounded-card border border-success/25 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                文件校验通过
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-card border border-border bg-surface-elevated p-2">
                  <div className="text-lg font-semibold text-foreground">{nodeCount}</div>
                  <div className="text-xs text-muted">节点</div>
                </div>
                <div className="rounded-card border border-border bg-surface-elevated p-2">
                  <div className="text-lg font-semibold text-foreground">{edgeCount}</div>
                  <div className="text-xs text-muted">连线</div>
                </div>
                <div className="rounded-card border border-border bg-surface-elevated p-2">
                  <div className="truncate text-lg font-semibold text-foreground">
                    {getImportSchemaVersion(parsedContent)}
                  </div>
                  <div className="text-xs text-muted">版本</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="import-name">
                    <Label>工作流名称</Label>
                  </label>
                  <Input
                    id="import-name"
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="输入工作流名称"
                    data-testid="import-name-input"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="import-description">
                    <Label>描述（可选）</Label>
                  </label>
                  <Textarea
                    id="import-description"
                    value={importDescription}
                    onChange={(e) => setImportDescription(e.target.value)}
                    rows={2}
                    placeholder="输入工作流描述"
                    data-testid="import-description-input"
                  />
                </div>
              </div>

              {importMutation.error && (
                <div className="flex items-start gap-2 rounded-card border border-error/25 bg-error/10 p-3 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {importMutation.error instanceof Error
                      ? importMutation.error.message
                      : '导入失败，请重试'}
                  </span>
                </div>
              )}
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={resetState}
                disabled={isImporting}
              >
                重新选择
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={isImporting || !importName.trim()}
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
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
