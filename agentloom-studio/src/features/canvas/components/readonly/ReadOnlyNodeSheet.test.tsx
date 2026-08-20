import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasNode } from '../../types'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { clonePortDefinitions } from '../../types/portSchema'
import { ReadOnlyNodeSheet } from './ReadOnlyNodeSheet'

vi.mock('@/features/execution', () => ({
  useNodeExecutionState: () => ({
    stepId: 'step-1',
    status: 'completed',
    isStreaming: false,
    output: '# 执行结果',
  }),
  useIsExecutionActive: () => false,
}))

function createNode(config: Record<string, unknown>): CanvasNode {
  const typeConfig = getNodeTypeConfig('http-tool')

  return {
    id: 'node-1',
    type: typeConfig.category,
    position: { x: 0, y: 0 },
    data: {
      label: '拉取用户资料',
      nodeType: typeConfig.type,
      category: typeConfig.category,
      description: typeConfig.description,
      config,
      inputPorts: clonePortDefinitions(typeConfig.inputPorts),
      outputPorts: clonePortDefinitions(typeConfig.outputPorts),
    },
  }
}

describe('ReadOnlyNodeSheet', () => {
  it('按注册表 schema 的标题只读展示配置，缺省字段标记为未配置', () => {
    render(
      <ReadOnlyNodeSheet
        node={createNode({ url: 'https://api.example.com/users' })}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('拉取用户资料')).toBeInTheDocument()
    expect(screen.getByText('URL')).toBeInTheDocument()
    expect(screen.getByText('https://api.example.com/users')).toBeInTheDocument()
    // 未填写的 schema 字段仍要出现在列表里，并显式标注未配置
    expect(screen.getByText('Headers')).toBeInTheDocument()
    expect(screen.getAllByText('未配置').length).toBeGreaterThan(0)
  })

  it('渲染布尔与结构化值，并保留 schema 之外的历史字段', () => {
    render(
      <ReadOnlyNodeSheet
        node={createNode({
          url: 'https://api.example.com',
          followRedirect: false,
          retryPolicy: { maxAttempts: 3 },
        })}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('followRedirect')).toBeInTheDocument()
    expect(screen.getByText('否')).toBeInTheDocument()
    expect(screen.getByText('retryPolicy')).toBeInTheDocument()
    expect(screen.getByText(/"maxAttempts": 3/)).toBeInTheDocument()
  })

  it('不渲染任何可编辑控件', () => {
    render(
      <ReadOnlyNodeSheet
        node={createNode({ url: 'https://api.example.com', timeout: 30 })}
        open
        onOpenChange={vi.fn()}
        showOutput
      />,
    )

    expect(screen.getByTestId('readonly-node-output')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('showOutput 未开启时不挂载执行输出区块', () => {
    render(
      <ReadOnlyNodeSheet
        node={createNode({ url: 'https://api.example.com' })}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByTestId('readonly-node-output-section'),
    ).not.toBeInTheDocument()
  })

  it('点击关闭按钮回传 open=false', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <ReadOnlyNodeSheet
        node={createNode({ url: 'https://api.example.com' })}
        open
        onOpenChange={onOpenChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('没有选中节点时不渲染', () => {
    render(<ReadOnlyNodeSheet node={null} open onOpenChange={vi.fn()} />)

    expect(screen.queryByTestId('readonly-node-sheet')).not.toBeInTheDocument()
  })
})
