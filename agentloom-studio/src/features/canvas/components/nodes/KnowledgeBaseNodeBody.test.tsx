import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeBaseNodeBody } from './KnowledgeBaseNodeBody'

const mockUseViewport = vi.fn()

vi.mock('@xyflow/react', () => ({
  useViewport: () => mockUseViewport(),
}))

describe('KnowledgeBaseNodeBody', () => {
  beforeEach(() => {
    mockUseViewport.mockReturnValue({ zoom: 1 })
  })

  it('在未配置时显示占位状态', () => {
    render(<KnowledgeBaseNodeBody config={{}} />)

    expect(screen.getByText('选择知识库')).toBeInTheDocument()
  })

  it('在低缩放级别只显示名称', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.3 })

    render(
      <KnowledgeBaseNodeBody
        config={{
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: '产品文档库',
          knowledgeBaseDocumentCount: 8,
        }}
      />,
    )

    expect(screen.getByTestId('knowledge-node-low')).toBeInTheDocument()
    expect(screen.getByText('产品文档库')).toBeInTheDocument()
    expect(screen.queryByText('8 个文档')).not.toBeInTheDocument()
  })

  it('在中缩放级别显示名称和文档数', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.55 })

    render(
      <KnowledgeBaseNodeBody
        config={{
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: '产品文档库',
          knowledgeBaseDocumentCount: 8,
        }}
      />,
    )

    expect(screen.getByTestId('knowledge-node-medium')).toBeInTheDocument()
    expect(screen.getByText('产品文档库')).toBeInTheDocument()
    expect(screen.getByText('8 个文档')).toBeInTheDocument()
  })

  it('在高缩放级别显示完整知识库摘要', () => {
    mockUseViewport.mockReturnValue({ zoom: 0.9 })

    render(
      <KnowledgeBaseNodeBody
        config={{
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: '产品文档库',
          knowledgeBaseDocumentCount: 8,
          knowledgeBaseChunkCount: 42,
          knowledgeBaseStatus: 'ready',
        }}
      />,
    )

    expect(screen.getByTestId('knowledge-node-high')).toBeInTheDocument()
    expect(screen.getByText('产品文档库')).toBeInTheDocument()
    expect(screen.getByText('可用')).toBeInTheDocument()
    expect(screen.getByText('8 个文档')).toBeInTheDocument()
    expect(screen.getByText('42 个分块')).toBeInTheDocument()
  })
})
