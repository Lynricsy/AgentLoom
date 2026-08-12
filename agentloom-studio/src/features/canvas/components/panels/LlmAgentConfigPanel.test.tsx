import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTONOMY_CONFIG, type AutonomyConfig } from '../../autonomy.types'
import { createDefaultAgentNodeData, type CanvasNode } from '../../types'
import { useCanvasStore } from '../../stores/canvasStore'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { clonePortDefinitions } from '../../types/portSchema'
import { LlmAgentConfigPanel } from './LlmAgentConfigPanel'

const {
  mockUseAuthToken,
  mockUseCurrentOrganization,
  mockUseOrganizationAutonomyPolicy,
} = vi.hoisted(() => ({
  mockUseAuthToken: vi.fn(),
  mockUseCurrentOrganization: vi.fn(),
  mockUseOrganizationAutonomyPolicy: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: () => mockUseAuthToken(),
}))

vi.mock('@/features/organization-autonomy-policy/hooks/useOrganizationAutonomyPolicy', () => ({
  useOrganizationAutonomyPolicy: (...args: unknown[]) => mockUseOrganizationAutonomyPolicy(...args),
}))

// 组织 id 只能由服务端解析（GET organizations/current），令牌里没有组织 claim
vi.mock('@/features/organization/api/organizationQueries', () => ({
  useCurrentOrganization: (...args: unknown[]) => mockUseCurrentOrganization(...args),
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    defaultValue,
    onChange,
  }: {
    value?: string
    defaultValue?: string
    onChange?: (value: string) => void
  }) => (
    <textarea
      data-testid="llm-agent-monaco-editor"
      value={value ?? defaultValue ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

/** Radix Select 是 button + portal，选中项只能从 trigger 文案读，读不到表单 value */
function expectComboboxValue(name: string, optionLabel: string) {
  expect(screen.getByRole('combobox', { name })).toHaveTextContent(optionLabel)
}

/**
 * 展开 Radix Select 并选中一项。
 * 全程用 fireEvent 键盘事件同步派发：userEvent 在 fake timers 下会卡在内部 delay，
 * 而本文件多数用例都开着 fake timers 验证 300ms autosave。
 */
async function chooseOption(comboboxName: string, optionLabel: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: comboboxName }), {
    key: 'Enter',
  })

  await act(async () => {
    fireEvent.keyDown(screen.getByRole('option', { name: optionLabel }), {
      key: 'Enter',
    })
    await Promise.resolve()
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function createSelectedAgentNode(
  autonomyConfig: AutonomyConfig | Record<string, unknown> = DEFAULT_AUTONOMY_CONFIG,
  config: Record<string, unknown> = {},
  dataOverride: Partial<CanvasNode['data']> = {},
): CanvasNode {
  const llmAgentType = getNodeTypeConfig('agent')
  const defaultAgentData = createDefaultAgentNodeData()
  const baseData: CanvasNode['data'] = {
    label: llmAgentType.label,
    nodeType: llmAgentType.type,
    category: llmAgentType.category,
    description: llmAgentType.description,
    config: { ...config },
    inputPorts: clonePortDefinitions(llmAgentType.inputPorts),
    outputPorts: clonePortDefinitions(llmAgentType.outputPorts),
    ...defaultAgentData,
    autonomyConfig: {
      ...defaultAgentData.autonomyConfig,
      ...asRecord(autonomyConfig),
    },
  }

  return {
    id: 'node-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      ...baseData,
      ...dataOverride,
      config: Object.assign({}, asRecord(baseData.config), asRecord(dataOverride.config)),
      autonomyConfig: Object.assign(
        {},
        asRecord(baseData.autonomyConfig),
        asRecord(dataOverride.autonomyConfig),
      ),
    },
  }
}

function setSelectedAgentNode(
  autonomyConfig: AutonomyConfig | Record<string, unknown> = DEFAULT_AUTONOMY_CONFIG,
  config: Record<string, unknown> = {},
  dataOverride: Partial<CanvasNode['data']> = {},
) {
  useCanvasStore.setState({
    nodes: [createSelectedAgentNode(autonomyConfig, config, dataOverride)],
    selectedNodeId: 'node-1',
  })
}

function StoreBackedLlmAgentConfigPanel() {
  const selectedNode = useCanvasStore((state) =>
    state.selectedNodeId ? state.nodes.find((node) => node.id === state.selectedNodeId) ?? null : null,
  )

  if (!selectedNode) {
    return null
  }

  return (
    <LlmAgentConfigPanel
      config={selectedNode.data.config}
      onApply={(patch) => useCanvasStore.getState().actions.updateNodeData(selectedNode.id, patch)}
    />
  )
}

describe('LlmAgentConfigPanel', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    mockUseAuthToken.mockReturnValue(undefined)
    mockUseCurrentOrganization.mockReturnValue({ data: undefined })
    mockUseOrganizationAutonomyPolicy.mockReturnValue({ data: undefined })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes the visible Monaco editor content when config.systemPrompt changes after mount', async () => {
    const { rerender } = render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '初始系统提示词',
          outputSchemaTitle: 'InitialSchema',
        }}
        onApply={vi.fn()}
      />,
    )

    await waitFor(
      () => {
        expect(screen.queryByTestId('llm-agent-editor-fallback')).not.toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    const editor = await screen.findByTestId('llm-agent-monaco-editor', undefined, {
      timeout: 5000,
    })

    expect(editor).toHaveValue('初始系统提示词')

    rerender(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '更新后的系统提示词',
          outputSchemaTitle: 'UpdatedSchema',
        }}
        onApply={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('llm-agent-monaco-editor')).toHaveValue('更新后的系统提示词')
    })
  })

  it('hydrates and resets autonomy fields from the selected node autonomyConfig after mount', async () => {
    setSelectedAgentNode(
      {
        mode: 'RULE_BASED',
        allowedInferenceFields: ['context.summary', 'inputs.userGoal'],
        confirmationThreshold: 0.64,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '请总结上下文',
        outputSchemaTitle: 'SummarySchema',
      },
    )

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '请总结上下文',
          outputSchemaTitle: 'SummarySchema',
        }}
        onApply={vi.fn()}
      />,
    )

    expectComboboxValue('自主模式', '规则补全')
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.summary\ninputs.userGoal',
    )
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expectComboboxValue('兜底策略', '使用默认值')

    act(() => {
      setSelectedAgentNode(
        {
          mode: 'LLM_SUGGEST',
          allowedInferenceFields: ['context.summary'],
          confirmationThreshold: 0.55,
          fallbackStrategy: 'ABORT_EXECUTION',
        },
        {
          systemPrompt: '请先给出建议，再等待确认',
          outputSchemaTitle: 'SuggestionSchema',
        },
      )
    })

    await waitFor(() => {
      expectComboboxValue('自主模式', 'LLM 建议')
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expectComboboxValue('兜底策略', '终止执行')
    expect(screen.getByText(/建议可回退，不构成强承诺/)).toBeInTheDocument()
  })

  it('reads autonomy mode using top-level mirror precedence over nested mirrors', async () => {
    setSelectedAgentNode(
      {
        mode: 'RULE_BASED',
        allowedInferenceFields: ['context.summary'],
        confirmationThreshold: 0.64,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '请总结上下文',
        outputSchemaTitle: 'SummarySchema',
        autonomyMode: 'MANUAL_CONFIRM',
      },
      {
        autonomyMode: 'LLM_SUGGEST',
        settings: {
          autonomyMode: 'MANUAL_CONFIRM',
        },
      },
    )

    await act(async () => {
      render(
        <LlmAgentConfigPanel
          config={{
            systemPrompt: '请总结上下文',
            outputSchemaTitle: 'SummarySchema',
            autonomyMode: 'MANUAL_CONFIRM',
          }}
          onApply={vi.fn()}
        />,
      )
      await Promise.resolve()
    })

    await waitFor(() => {
      expectComboboxValue('自主模式', 'LLM 建议')
    })
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.64)
    expectComboboxValue('兜底策略', '使用默认值')
  })

  it('falls back from settings.autonomyMode to config.autonomyMode when higher-priority mirrors are absent', async () => {
    setSelectedAgentNode(
      {
        mode: undefined,
        allowedInferenceFields: ['context.summary'],
        confirmationThreshold: 0.64,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '请总结上下文',
        outputSchemaTitle: 'SummarySchema',
        autonomyMode: 'LLM_SUGGEST',
      },
      {
        settings: {
          autonomyMode: 'RULE_BASED',
        },
      },
    )

    await act(async () => {
      render(
        <LlmAgentConfigPanel
          config={{
            systemPrompt: '请总结上下文',
            outputSchemaTitle: 'SummarySchema',
            autonomyMode: 'LLM_SUGGEST',
          }}
          onApply={vi.fn()}
        />,
      )
      await Promise.resolve()
    })

    await waitFor(() => {
      expectComboboxValue('自主模式', '规则补全')
    })
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expectComboboxValue('兜底策略', '使用默认值')
  })

  it('shows and hides autonomy fields dynamically when switching modes', async () => {
    setSelectedAgentNode(DEFAULT_AUTONOMY_CONFIG)

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '',
          outputSchemaTitle: '',
        }}
        onApply={vi.fn()}
      />,
    )

    const modeSelect = screen.getByRole('combobox', { name: '自主模式' })

    expect(modeSelect).toHaveTextContent('手动确认')
    expect(screen.queryByRole('textbox', { name: '允许推断字段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '兜底策略' })).not.toBeInTheDocument()

    await chooseOption('自主模式', '规则补全')

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toBeInTheDocument()

    await chooseOption('自主模式', 'LLM 建议')

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toBeInTheDocument()
    expect(screen.getByText(/建议可回退，不构成强承诺/)).toBeInTheDocument()
  })

  it('shows the organization cap and disables higher autonomy options', async () => {
    mockUseAuthToken.mockReturnValue('owner-token')
    mockUseCurrentOrganization.mockReturnValue({ data: { id: 'org-1' } })
    mockUseOrganizationAutonomyPolicy.mockReturnValue({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'RULE_BASED',
        version: 3,
        violationSummary: { workflowCount: 0, nodeCount: 0 },
      },
    })
    setSelectedAgentNode(DEFAULT_AUTONOMY_CONFIG)

    await act(async () => {
      render(
        <LlmAgentConfigPanel
          config={{
            systemPrompt: '',
            outputSchemaTitle: '',
          }}
          onApply={vi.fn()}
        />,
      )
      await Promise.resolve()
    })

    expect(screen.getByTestId('llm-agent-autonomy-cap-notice')).toHaveTextContent(
      '组织自治上限：规则补全',
    )
    // Radix Select 的选项只有在展开时才进入无障碍树
    fireEvent.keyDown(screen.getByRole('combobox', { name: '自主模式' }), {
      key: 'Enter',
    })

    expect(
      screen.getByRole('option', { name: 'LLM 建议（受组织策略限制）' }),
    ).toHaveAttribute('data-disabled')
    expect(screen.getByRole('option', { name: '规则补全' })).not.toHaveAttribute(
      'data-disabled',
    )
  })

  it('用 organizations/current 返回的组织 id 请求组织自治策略', async () => {
    mockUseAuthToken.mockReturnValue('owner-token')
    mockUseCurrentOrganization.mockReturnValue({ data: { id: 'org-1' } })
    setSelectedAgentNode(DEFAULT_AUTONOMY_CONFIG)

    await act(async () => {
      render(
        <LlmAgentConfigPanel
          config={{ systemPrompt: '', outputSchemaTitle: '' }}
          onApply={vi.fn()}
        />,
      )
      await Promise.resolve()
    })

    expect(mockUseCurrentOrganization).toHaveBeenCalledWith({ enabled: true })
    expect(mockUseOrganizationAutonomyPolicy).toHaveBeenCalledWith('org-1', { enabled: true })
    expect(mockUseOrganizationAutonomyPolicy).not.toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true }),
    )
  })

  it('拿不到当前组织时不请求组织自治策略，面板降级为无上限', async () => {
    mockUseAuthToken.mockReturnValue('owner-token')
    mockUseCurrentOrganization.mockReturnValue({ data: undefined })
    setSelectedAgentNode(DEFAULT_AUTONOMY_CONFIG)

    await act(async () => {
      render(
        <LlmAgentConfigPanel
          config={{ systemPrompt: '', outputSchemaTitle: '' }}
          onApply={vi.fn()}
        />,
      )
      await Promise.resolve()
    })

    expect(mockUseOrganizationAutonomyPolicy).toHaveBeenCalledWith(undefined, { enabled: false })
    expect(screen.queryByTestId('llm-agent-autonomy-cap-notice')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('combobox', { name: '自主模式' }), { key: 'Enter' })

    expect(screen.getByRole('option', { name: 'LLM 建议' })).not.toHaveAttribute('data-disabled')
  })

  it('keeps stale over-cap modes visible and blocks autosave until downgraded', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()
    const onValidationChange = vi.fn()

    mockUseAuthToken.mockReturnValue('owner-token')
    mockUseCurrentOrganization.mockReturnValue({ data: { id: 'org-1' } })
    mockUseOrganizationAutonomyPolicy.mockReturnValue({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'RULE_BASED',
        version: 3,
        violationSummary: { workflowCount: 1, nodeCount: 1 },
      },
    })

    setSelectedAgentNode(
      {
        mode: 'LLM_SUGGEST',
        allowedInferenceFields: ['context.topic'],
        confirmationThreshold: 0.55,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'SuggestionSchema',
      },
    )

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '先建议，再等待确认',
          outputSchemaTitle: 'SuggestionSchema',
        }}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    )

    expectComboboxValue('自主模式', 'LLM 建议')
    expect(screen.getByTestId('llm-agent-autonomy-policy-warning')).toHaveTextContent(
      '高于组织自治上限“规则补全”',
    )
    expect(onValidationChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'outputSchemaTitle' }), {
        target: { value: 'ChangedSchema' },
      })
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onApply).not.toHaveBeenCalled()

    await chooseOption('自主模式', '规则补全')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onValidationChange).toHaveBeenLastCalledWith(false)
    expect(onApply).toHaveBeenLastCalledWith({
      autonomyMode: 'RULE_BASED',
      settings: {
        autonomyMode: 'RULE_BASED',
      },
      config: {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'ChangedSchema',
        autonomyMode: 'RULE_BASED',
      },
      autonomyConfig: {
        mode: 'RULE_BASED',
        allowedInferenceFields: ['context.topic'],
        confirmationThreshold: DEFAULT_AUTONOMY_CONFIG.confirmationThreshold,
        fallbackStrategy: 'USE_DEFAULT',
      },
    })
  })

  it('surfaces legacy raw modes and requires explicit acknowledgement before saving', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()
    const onValidationChange = vi.fn()

    setSelectedAgentNode(
      {
        mode: 'LLM_DECIDE',
        allowedInferenceFields: ['context.topic'],
        confirmationThreshold: 0.61,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '历史模式节点',
        outputSchemaTitle: 'LegacySchema',
      },
    )

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '历史模式节点',
          outputSchemaTitle: 'LegacySchema',
        }}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    )

    expect(screen.getByTestId('llm-agent-autonomy-legacy-warning')).toHaveTextContent(
      '检测到历史自主模式“LLM_DECIDE”',
    )
    expectComboboxValue('自主模式', '手动确认')
    expect(onValidationChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.blur(screen.getByRole('combobox', { name: '自主模式' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'outputSchemaTitle' }), {
        target: { value: 'LegacySchemaV2' },
      })
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onValidationChange).toHaveBeenLastCalledWith(false)
    expect(onApply).toHaveBeenLastCalledWith({
      autonomyMode: 'MANUAL_CONFIRM',
      settings: {
        autonomyMode: 'MANUAL_CONFIRM',
      },
      config: {
        systemPrompt: '历史模式节点',
        outputSchemaTitle: 'LegacySchemaV2',
        autonomyMode: 'MANUAL_CONFIRM',
      },
      autonomyConfig: DEFAULT_AUTONOMY_CONFIG,
    })
  })

  it('preserves llm-suggest draft values across MANUAL_CONFIRM round-trips within the open form', async () => {
    setSelectedAgentNode({
      mode: 'LLM_SUGGEST',
      allowedInferenceFields: ['context.topic', 'inputs.summary.title'],
      confirmationThreshold: 0.55,
      fallbackStrategy: 'ABORT_EXECUTION',
    })

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '先建议，再等待人工确认',
          outputSchemaTitle: 'SuggestionSchema',
        }}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.topic\ninputs.summary.title',
    )
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expectComboboxValue('兜底策略', '终止执行')

    await chooseOption('自主模式', '手动确认')

    expect(screen.queryByRole('textbox', { name: '允许推断字段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '兜底策略' })).not.toBeInTheDocument()

    await chooseOption('自主模式', 'LLM 建议')

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.topic\ninputs.summary.title',
    )
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expectComboboxValue('兜底策略', '终止执行')
  })

  it('autosaves canonical MANUAL_CONFIRM while preserving hidden drafts for a later switch back', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()

    setSelectedAgentNode(
      {
        mode: 'LLM_SUGGEST',
        allowedInferenceFields: ['context.topic'],
        confirmationThreshold: 0.55,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'SuggestionSchema',
      },
    )

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '先建议，再等待确认',
          outputSchemaTitle: 'SuggestionSchema',
        }}
        onApply={onApply}
      />,
    )

    await chooseOption('自主模式', '手动确认')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onApply).toHaveBeenLastCalledWith({
      autonomyMode: 'MANUAL_CONFIRM',
      settings: {
        autonomyMode: 'MANUAL_CONFIRM',
      },
      config: {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'SuggestionSchema',
        autonomyMode: 'MANUAL_CONFIRM',
      },
      autonomyConfig: DEFAULT_AUTONOMY_CONFIG,
    })

    await chooseOption('自主模式', 'LLM 建议')

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.topic')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expectComboboxValue('兜底策略', '使用默认值')
  })

  it('preserves hidden drafts after the real store write-back resets the form', async () => {
    vi.useFakeTimers()

    setSelectedAgentNode(
      {
        mode: 'LLM_SUGGEST',
        allowedInferenceFields: ['context.topic'],
        confirmationThreshold: 0.55,
        fallbackStrategy: 'USE_DEFAULT',
      },
      {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'SuggestionSchema',
        temperature: 0.2,
      },
      {
        settings: {
          panelCollapsed: true,
        },
      },
    )

    render(<StoreBackedLlmAgentConfigPanel />)

    await chooseOption('自主模式', '手动确认')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(useCanvasStore.getState().nodes[0]?.data.autonomyMode).toBe('MANUAL_CONFIRM')
    expect(useCanvasStore.getState().nodes[0]?.data.autonomyConfig).toEqual(DEFAULT_AUTONOMY_CONFIG)
    expect(useCanvasStore.getState().nodes[0]?.data.config).toMatchObject({
      systemPrompt: '先建议，再等待确认',
      outputSchemaTitle: 'SuggestionSchema',
      temperature: 0.2,
      autonomyMode: 'MANUAL_CONFIRM',
    })
    expect(useCanvasStore.getState().nodes[0]?.data.settings).toEqual({
      panelCollapsed: true,
      autonomyMode: 'MANUAL_CONFIRM',
    })

    await chooseOption('自主模式', 'LLM 建议')

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.topic')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expectComboboxValue('兜底策略', '使用默认值')
  })

  it('shows threshold errors before blur when the current llm-suggest threshold becomes invalid', async () => {
    setSelectedAgentNode({
      mode: 'LLM_SUGGEST',
      allowedInferenceFields: ['context.topic'],
      confirmationThreshold: 0.8,
      fallbackStrategy: 'USE_DEFAULT',
    })

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '先分析，再建议',
          outputSchemaTitle: 'SuggestionSchema',
        }}
        onApply={vi.fn()}
      />,
    )

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: '确认阈值' }), {
        target: { value: '1.2' },
      })
      await Promise.resolve()
    })

    expect(screen.getByText('确认阈值必须在 0 到 1 之间')).toBeInTheDocument()
  })

  it('shows clear Chinese threshold errors, reports invalid state, and blocks invalid saves', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()
    const onValidationChange = vi.fn()

    setSelectedAgentNode({
      mode: 'LLM_SUGGEST',
      allowedInferenceFields: ['context.topic'],
      confirmationThreshold: 0.8,
      fallbackStrategy: 'USE_DEFAULT',
    })

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '先分析，再建议',
          outputSchemaTitle: 'SuggestionSchema',
        }}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    )

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: '确认阈值' }), {
        target: { value: '1.2' },
      })
      fireEvent.blur(screen.getByRole('spinbutton', { name: '确认阈值' }))
      await Promise.resolve()
    })

    expect(screen.getByText('确认阈值必须在 0 到 1 之间')).toBeInTheDocument()
    expect(onValidationChange).toHaveBeenLastCalledWith(true)

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onApply).not.toHaveBeenCalled()
  })

  it('keeps existing fields autosave behavior while writing all autonomy mirrors and preserving unrelated fields', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()

    setSelectedAgentNode(
      {
        ...DEFAULT_AUTONOMY_CONFIG,
        customFlag: 'keep-me',
      },
      {
        systemPrompt: '初始系统提示词',
        outputSchemaTitle: 'InitialSchema',
        temperature: 0.7,
      },
      {
        settings: {
          persistMe: true,
        },
      },
    )

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '初始系统提示词',
          outputSchemaTitle: 'InitialSchema',
          temperature: 0.7,
        }}
        onApply={onApply}
      />,
    )

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'outputSchemaTitle' }), {
        target: { value: 'UpdatedSchema' },
      })
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onApply).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(onApply).toHaveBeenLastCalledWith({
      autonomyMode: 'MANUAL_CONFIRM',
      settings: {
        persistMe: true,
        autonomyMode: 'MANUAL_CONFIRM',
      },
      config: {
        systemPrompt: '初始系统提示词',
        outputSchemaTitle: 'UpdatedSchema',
        temperature: 0.7,
        autonomyMode: 'MANUAL_CONFIRM',
      },
      autonomyConfig: {
        ...DEFAULT_AUTONOMY_CONFIG,
        customFlag: 'keep-me',
      },
    })
  })
})
