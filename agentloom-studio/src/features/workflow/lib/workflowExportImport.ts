import type { WorkflowExportEnvelope } from '../types'

export const WORKFLOW_EXPORT_FILE_EXTENSION = '.agentloom-workflow.json'

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024

export function downloadWorkflowExport(data: WorkflowExportEnvelope, workflowName: string): void {
  const slug = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
  const date = new Date().toISOString().split('T')[0]
  const filename = `${slug}-${date}${WORKFLOW_EXPORT_FILE_EXTENSION}`

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function parseImportFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error(`文件大小超出限制 (最大 ${(MAX_IMPORT_FILE_SIZE / 1024 / 1024).toFixed(0)}MB)`)
  }

  return file.text()
}
