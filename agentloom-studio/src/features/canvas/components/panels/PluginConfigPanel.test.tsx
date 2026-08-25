import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginConfigPanel } from './PluginConfigPanel'
import type { CanvasNode, PluginNodeData } from '../../types'

function makeNode(overrides: Partial<PluginNodeData> = {}): CanvasNode {
  const data: PluginNodeData = {
    label: '翻译节点',
    nodeType: 'plugin',
    config: {},
    pluginId: 'com.example.translate',
    pluginName: '翻译插件',
    pluginVersion: '1.2.0',
    pluginNodeType: 'translate',
    ...overrides,
  } as PluginNodeData

  return { id: 'node-1', type: 'plugin', position: { x: 0, y: 0 }, data } as CanvasNode
}

const SCHEMA = {
  type: 'object',
  properties: {
    targetLang: { type: 'string', title: '目标语言' },
    retries: { type: 'number', title: '重试次数', default: 2 },
    keepFormatting: { type: 'boolean', title: '保留排版', default: true },
    tone: { type: 'string', title: '语气', enum: ['formal', 'casual'] },
  },
  required: ['targetLang'],
}

describe('PluginConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缺少 pluginId 时上报无效并给出提示', () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({ pluginId: '', pluginName: '' })}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    expect(onValidationChange).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('plugin-config-identity-error')).toBeInTheDocument()
  })

  it('缺少 pluginNodeType 时上报无效', () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({ pluginNodeType: '' })}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    expect(onValidationChange).toHaveBeenCalledWith(true)
  })

  it('身份齐全且无配置 schema 时上报有效', () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode()}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    expect(onValidationChange).toHaveBeenCalledWith(false)
    expect(
      screen.queryByTestId('plugin-config-identity-error'),
    ).not.toBeInTheDocument()
  })

  it('必填字段为空时未交互也上报无效', () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({ pluginConfigSchema: SCHEMA })}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    // 不点、不 blur:空必填配置必须当场判无效,否则节点会带空配置进入执行
    expect(onValidationChange).toHaveBeenLastCalledWith(true)
  })

  it('必填字段 blur 后仍上报无效并展示错误文案', async () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({ pluginConfigSchema: SCHEMA })}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    const input = screen.getByLabelText(/目标语言/)
    await userEvent.click(input)
    await userEvent.tab()

    await waitFor(() => {
      expect(screen.getByText('此字段为必填项')).toBeInTheDocument()
    })
    expect(onValidationChange).toHaveBeenLastCalledWith(true)
  })

  it('必填字段已有值时未交互上报有效', () => {
    const onValidationChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({
          pluginConfigSchema: SCHEMA,
          pluginConfig: { targetLang: 'ja' },
        })}
        onConfigChange={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    expect(onValidationChange).toHaveBeenLastCalledWith(false)
  })

  it('按字段 type 渲染 number / boolean / enum 控件并回写正确的值类型', async () => {
    const onConfigChange = vi.fn()

    render(
      <PluginConfigPanel
        node={makeNode({
          pluginConfigSchema: SCHEMA,
          pluginConfig: { targetLang: 'ja' },
        })}
        onConfigChange={onConfigChange}
        onValidationChange={vi.fn()}
      />,
    )

    // number 字段用 number 输入框，默认值来自 schema.default
    const retries = screen.getByLabelText(/重试次数/)
    expect(retries).toHaveAttribute('type', 'number')
    expect(retries).toHaveValue(2)

    // boolean 字段渲染开关（底层是 checkbox input），默认值同样取 schema.default
    expect(screen.getByRole('checkbox', { name: /保留排版/ })).toBeChecked()

    // enum 字段渲染下拉
    expect(screen.getByRole('combobox', { name: /语气/ })).toBeInTheDocument()

    fireEvent.change(retries, { target: { value: '5' } })

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginConfig: expect.objectContaining({
            targetLang: 'ja',
            retries: 5,
            keepFormatting: true,
          }),
        }),
      )
    })

    const lastPatch = onConfigChange.mock.lastCall?.[0] as {
      pluginConfig: Record<string, unknown>
    }
    expect(typeof lastPatch.pluginConfig.retries).toBe('number')
    expect(typeof lastPatch.pluginConfig.keepFormatting).toBe('boolean')
  })
})
