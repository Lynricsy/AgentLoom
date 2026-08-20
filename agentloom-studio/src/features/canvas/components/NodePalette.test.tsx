import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DYNAMIC_ONLY_NODE_TYPES, getAllNodeTypes } from '../types/nodeTypeRegistry'
import { PALETTE_GROUPS } from './nodeCategories'
import { DRAG_TRANSFER_TYPE, NodePalette } from './NodePalette'

vi.mock('@/features/block-library', () => ({
  BlockLibraryPanel: () => <div data-testid="block-library-panel">块库面板</div>,
}))

const mockUseActivePlugins = vi.hoisted(() =>
  vi.fn(
    () =>
      ({
        data: undefined as { data: Array<unknown> } | undefined,
      }) as { data: { data: Array<unknown> } | undefined },
  ),
)

vi.mock('@/features/plugin', () => ({
  useActivePlugins: mockUseActivePlugins,
}))

describe('NodePalette', () => {
  beforeEach(() => {
    mockUseActivePlugins.mockReset()
    mockUseActivePlugins.mockReturnValue({ data: undefined })
  })

  it('renders tabs for nodes and blocks', () => {
    render(<NodePalette />)

    expect(screen.getByRole('button', { name: '节点' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Blocks' })).toBeInTheDocument()
  })

  it('renders all palette groups', () => {
    render(<NodePalette />)

    const groupHeaders = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('.flex-1.text-left'))
      .map((btn) => btn.querySelector('.flex-1.text-left')?.textContent)

    expect(groupHeaders).toContain('Agent')
    expect(groupHeaders).toContain('Tool')
    expect(groupHeaders).toContain('Trigger')
    expect(groupHeaders).toContain('Knowledge')
    expect(groupHeaders).toContain('Memory')
    expect(groupHeaders).toContain('Output')
    expect(groupHeaders).toContain('Control')
  })

  it('switches to the block library tab', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.click(screen.getByRole('button', { name: 'My Blocks' }))

    expect(screen.getByTestId('block-library-panel')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索节点...')).not.toBeInTheDocument()
  })

  it('derives palette items from the node type registry', () => {
    const paletteTypes = PALETTE_GROUPS.flatMap((group) => group.items.map((item) => item.type))
    const registryTypes = getAllNodeTypes()
      .filter((config) => !DYNAMIC_ONLY_NODE_TYPES.has(config.type))
      .map((config) => config.type)

    expect(paletteTypes).toEqual([
      'llm-model',
      'smart-routing',
      'agent',
      'skill',
      'http-tool',
      'code-tool',
      'mcp-tool',
      'sandbox',
      'input-preprocessor',
      'workspace',
      'manual-trigger',
      'schedule-trigger',
      'webhook-trigger',
      'api-event-trigger',
      'knowledge-base',
      'memory',
      'text',
      'text-output',
      'json-output',
      'condition',
      'loop',
      'iteration',
      'merge',
    ])
    expect(new Set(paletteTypes)).toEqual(
      new Set([...registryTypes, 'merge']),
    )
  })

  it('filters items by search query', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.type(screen.getByPlaceholderText('搜索节点...'), 'schedule')

    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.queryByText('LLM 模型')).not.toBeInTheDocument()
  })

  it('matches built-in nodes by english slug aliases', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.type(screen.getByPlaceholderText('搜索节点...'), 'smart routing')

    expect(screen.getByText('智能路由')).toBeInTheDocument()
    expect(screen.queryByText('LLM 模型')).not.toBeInTheDocument()
  })

  it('collapses and expands groups', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    const agentHeader = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('.flex-1.text-left')?.textContent === 'Agent')

    if (!agentHeader) {
      throw new Error('Expected Agent group toggle to exist')
    }

    await user.click(agentHeader)
    expect(screen.queryByText('LLM 模型')).not.toBeInTheDocument()

    await user.click(agentHeader)
    expect(screen.getByText('LLM 模型')).toBeInTheDocument()
  })

  it('writes drag payloads using the expected transfer type', async () => {
    render(<NodePalette />)

    const setData = vi.fn()
    const dragTarget = screen.getByText('LLM 模型').closest('button')

    if (!dragTarget) {
      throw new Error('Expected draggable palette item to exist')
    }

    fireEvent.dragStart(dragTarget, {
      dataTransfer: {
        setData,
        effectAllowed: 'none',
      } as unknown as DataTransfer,
    })

    expect(setData).toHaveBeenCalledWith(DRAG_TRANSFER_TYPE, expect.stringContaining('llm-model'))
  })

  it('renders plugin palette items from active plugins and writes plugin metadata into drag payloads', () => {
    mockUseActivePlugins.mockReturnValue({
      data: {
        data: [
          {
            id: 'plugin-record-1',
            pluginId: 'com.example.uppercase',
            name: 'Uppercase Plugin',
            version: '1.0.1',
            author: 'AgentLoom Team',
            description: '把文本转成大写',
            license: 'MIT',
            status: 'active',
            manifest: {},
            permissions: [],
            metadata: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
            nodeDefinitions: [
              {
                type: 'uppercase-node',
                label: 'Uppercase QA',
                category: 'transform',
                description: '将输入文本转换为大写',
                inputPorts: [
                  {
                    id: 'text-in',
                    label: '输入文本',
                    dataType: 'text',
                    required: true,
                  },
                ],
                outputPorts: [
                  {
                    id: 'text-out',
                    label: '输出文本',
                    dataType: 'text',
                  },
                ],
                configSchema: {
                  type: 'object',
                  properties: {
                    prefix: {
                      type: 'string',
                      title: '前缀',
                    },
                  },
                  required: [],
                },
              },
            ],
          },
        ],
      },
    })

    render(<NodePalette />)

    expect(screen.getByText('Plugins')).toBeInTheDocument()
    const dragTarget = screen.getByText('Uppercase QA').closest('button')

    if (!dragTarget) {
      throw new Error('Expected plugin palette item to exist')
    }

    const setData = vi.fn()
    fireEvent.dragStart(dragTarget, {
      dataTransfer: {
        setData,
        effectAllowed: 'none',
      } as unknown as DataTransfer,
    })

    const payload = setData.mock.calls.find(
      ([type]) => type === DRAG_TRANSFER_TYPE,
    )?.[1]

    expect(payload).toBeTruthy()
    expect(JSON.parse(payload as string)).toMatchObject({
      type: 'plugin',
      pluginId: 'com.example.uppercase',
      pluginName: 'Uppercase Plugin',
      pluginVersion: '1.0.1',
      pluginNodeType: 'uppercase-node',
      pluginConfigSchema: {
        type: 'object',
      },
      inputPorts: [
        {
          id: 'text-in',
          dataType: 'text',
          direction: 'input',
        },
      ],
      outputPorts: [
        {
          id: 'text-out',
          dataType: 'text',
          direction: 'output',
        },
      ],
    })
  })

  it('includes MCP Tool as a static palette item in the Tool group', () => {
    render(<NodePalette />)
    expect(screen.getByText('MCP Tool')).toBeInTheDocument()
  })
})
