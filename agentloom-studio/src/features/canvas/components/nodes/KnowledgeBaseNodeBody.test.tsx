import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KnowledgeBaseNodeBody } from './KnowledgeBaseNodeBody'

describe('KnowledgeBaseNodeBody', () => {
  it('在未配置时显示占位状态', () => {
    render(<KnowledgeBaseNodeBody config={{}} />)

    expect(screen.getByText('选择知识库')).toBeInTheDocument()
  })

  it('已配置时显示名称与文档数徽章', () => {
    render(
      <KnowledgeBaseNodeBody
        config={{
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: '产品文档库',
          knowledgeBaseDocumentCount: 8,
        }}
      />,
    )

    expect(screen.getByTestId('knowledge-node-body')).toBeInTheDocument()
    expect(screen.getByText('产品文档库')).toBeInTheDocument()
    expect(screen.getByText('8 个文档')).toBeInTheDocument()
  })

  it('显示完整知识库摘要', () => {
    render(
      <KnowledgeBaseNodeBody
        config={{
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: '产品文档库',
          knowledgeBaseDocumentCount: 8,
          knowledgeBaseNodeCount: 42,
          knowledgeBaseChunkCount: 42,
          knowledgeBaseStatus: 'ready',
        }}
      />,
    )

    expect(screen.getByTestId('knowledge-node-body')).toBeInTheDocument()
    expect(screen.getByText('产品文档库')).toBeInTheDocument()
    expect(screen.getByText('可用')).toBeInTheDocument()
    expect(screen.getByText('8 个文档')).toBeInTheDocument()
    expect(screen.getByText('42 个知识节点')).toBeInTheDocument()
  })
})
