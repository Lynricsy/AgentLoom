import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PluginNodeData } from '../../../types'
import { PluginNodeBody } from '../PluginNodeBody'

function createPluginData(overrides: Partial<PluginNodeData> = {}): PluginNodeData {
  return {
    label: '插件节点',
    nodeType: 'plugin',
    category: 'plugin',
    description: '通过插件扩展的自定义节点',
    config: {},
    pluginId: 'test-plugin-id',
    pluginName: 'Test Plugin',
    pluginVersion: '1.0.0',
    pluginNodeType: 'custom-processor',
    inputPorts: [],
    outputPorts: [],
    ...overrides,
  }
}

describe('PluginNodeBody', () => {
  it('renders plugin name', () => {
    render(<PluginNodeBody data={createPluginData()} />)

    expect(screen.getByText('Test Plugin')).toBeInTheDocument()
  })

  it('renders plugin node type', () => {
    render(<PluginNodeBody data={createPluginData({ pluginNodeType: 'data-transformer' })} />)

    expect(screen.getByText('data-transformer')).toBeInTheDocument()
  })

  it('renders version badge', () => {
    render(<PluginNodeBody data={createPluginData({ pluginVersion: '2.3.1' })} />)

    expect(screen.getByText('v2.3.1')).toBeInTheDocument()
  })

  it('renders fallback text when pluginName is empty', () => {
    render(<PluginNodeBody data={createPluginData({ pluginName: '' })} />)

    expect(screen.getByText('未配置插件')).toBeInTheDocument()
  })

  it('does not render node type when pluginNodeType is empty', () => {
    render(<PluginNodeBody data={createPluginData({ pluginNodeType: '' })} />)

    expect(screen.queryByText('custom-processor')).not.toBeInTheDocument()
  })

  it('does not render version badge when pluginVersion is empty', () => {
    render(<PluginNodeBody data={createPluginData({ pluginVersion: '' })} />)

    expect(screen.queryByText(/^v/)).not.toBeInTheDocument()
  })
})
