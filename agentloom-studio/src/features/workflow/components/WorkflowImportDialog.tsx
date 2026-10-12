import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { FileUp, Loader2 } from 'lucide-react'
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Alert } from '@/shared/ui/alert'
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
  const [isDragging, setIsDragging] = useState(false)

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

  const processFile = useCallback(
    async (file: File) => {
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

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void processFile(file)
    },
    [processFile],
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLButtonElement>) => {
    // 阻止浏览器默认「打开文件」，并声明允许放置
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file && !validateMutation.isPending) void processFile(file)
    },
    [processFile, validateMutation.isPending],
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

        <AnimatePresence mode="wait" initial={false}>
          {step === 'upload' ? (
            <motion.div key="upload" {...fadeIn} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.agentloom-workflow.json"
                  className="hidden"
                  onChange={handleFileSelected}
                  data-testid="import-file-input"
                />

                <Button
                  variant="ghost"
                  onClick={handleClickUploadZone}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  disabled={isValidating}
                  className={cn(
                    'h-auto w-full flex-col gap-2 whitespace-normal rounded-lg border-2 border-dashed p-8 text-center font-normal transition-colors duration-150 [&_svg]:size-8',
                    isValidating
                      ? 'cursor-wait border-border bg-muted disabled:pointer-events-auto disabled:opacity-100'
                      : isDragging
                        ? 'border-primary bg-primary/5'
                        : 'cursor-pointer border-border hover:border-primary hover:bg-muted',
                  )}
                  data-dragging={isDragging || undefined}
                  data-testid="import-upload-zone"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">验证中…</span>
                    </>
                  ) : (
                    <>
                      <FileUp className={isDragging ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="text-sm text-foreground">
                        {isDragging ? '松开以上传文件' : '点击选择文件或拖拽文件到此处'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        支持 .json 和 .agentloom-workflow.json
                      </span>
                    </>
                  )}
                </Button>

                {fileError && <Alert variant="error">{fileError}</Alert>}

                {validationErrors.length > 0 && (
                  <Alert variant="error" title="文件校验失败">
                    <ul className="ml-4 list-disc space-y-0.5 text-xs">
                      {validationErrors.map((err) => (
                        <li key={err} className="break-words">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
              </DialogBody>
            </motion.div>
          ) : parsedContent ? (
            <motion.div key="preview" {...fadeIn} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="space-y-4">
                <Alert variant="success">文件校验通过</Alert>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-border bg-muted p-2">
                    <div className="text-lg font-semibold text-foreground tabular-nums">{nodeCount}</div>
                    <div className="text-xs text-muted-foreground">节点</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted p-2">
                    <div className="text-lg font-semibold text-foreground tabular-nums">{edgeCount}</div>
                    <div className="text-xs text-muted-foreground">连线</div>
                  </div>
                  <div className="min-w-0 rounded-lg border border-border bg-muted p-2">
                    <div className="truncate text-lg font-semibold text-foreground">
                      {getImportSchemaVersion(parsedContent)}
                    </div>
                    <div className="text-xs text-muted-foreground">版本</div>
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
                  <Alert variant="error">
                    {importMutation.error instanceof Error
                      ? importMutation.error.message
                      : '导入失败，请重试'}
                  </Alert>
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
                      <Loader2 className="animate-spin" />
                      导入中…
                    </>
                  ) : (
                    '导入'
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
