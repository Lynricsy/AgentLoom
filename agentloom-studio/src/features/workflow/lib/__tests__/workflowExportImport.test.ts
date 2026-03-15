import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowExportEnvelope } from '../../types'

const { downloadWorkflowExport, parseImportFile, MAX_IMPORT_FILE_SIZE } =
  await import('../workflowExportImport')

describe('workflowExportImport', () => {
  describe('downloadWorkflowExport', () => {
    let clickSpy: ReturnType<typeof vi.fn>
    let appendChildSpy: ReturnType<typeof vi.fn>
    let removeChildSpy: ReturnType<typeof vi.fn>
    let createObjectURLSpy: ReturnType<typeof vi.fn>
    let revokeObjectURLSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      clickSpy = vi.fn()
      appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(null as unknown as Node)
      removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(null as unknown as Node)
      createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/fake-blob')
      revokeObjectURLSpy = vi.fn()
      vi.stubGlobal('URL', {
        ...globalThis.URL,
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      })

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: clickSpy,
        set style(_v: string) {},
      } as unknown as HTMLAnchorElement)
    })

    it('creates Blob, anchor click, and revokes URL', () => {
      const data: WorkflowExportEnvelope = {
        schemaVersion: 'agentloom-workflow-v1',
        exportedAt: '2026-03-10T08:00:00.000Z',
        workflow: {
          name: 'Test',
          description: 'desc',
          definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        },
      }

      downloadWorkflowExport(data, 'Test Workflow')

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(appendChildSpy).toHaveBeenCalledTimes(1)
      expect(removeChildSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/fake-blob')
    })

    it('generates correct filename with slug + date extension', () => {
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        set style(_v: string) {},
      }
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockAnchor as unknown as HTMLAnchorElement,
      )

      const data: WorkflowExportEnvelope = {
        schemaVersion: 'agentloom-workflow-v1',
        exportedAt: '2026-03-10T08:00:00.000Z',
        workflow: {
          name: 'My Cool Workflow',
          description: null,
          definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        },
      }

      downloadWorkflowExport(data, 'My Cool Workflow')

      expect(mockAnchor.download).toMatch(
        /^my-cool-workflow-\d{4}-\d{2}-\d{2}\.agentloom-workflow\.json$/,
      )
    })
  })

  describe('parseImportFile', () => {
    it('rejects files larger than 5MB', async () => {
      const bigFile = new File(['x'], 'big.json', { type: 'application/json' })
      Object.defineProperty(bigFile, 'size', {
        value: MAX_IMPORT_FILE_SIZE + 1,
      })

      await expect(parseImportFile(bigFile)).rejects.toThrow('文件大小超出限制')
    })

    it('returns file text content for valid files', async () => {
      const content = '{"schemaVersion":"v1"}'
      const file = new File([content], 'valid.json', { type: 'application/json' })

      const result = await parseImportFile(file)
      expect(result).toBe(content)
    })

    it('handles empty files', async () => {
      const file = new File([''], 'empty.json', { type: 'application/json' })

      const result = await parseImportFile(file)
      expect(result).toBe('')
    })

    it('accepts files exactly at size limit', async () => {
      const file = new File(['x'], 'exact.json', { type: 'application/json' })
      Object.defineProperty(file, 'size', {
        value: MAX_IMPORT_FILE_SIZE,
      })

      await expect(parseImportFile(file)).resolves.toBeDefined()
    })
  })
})
