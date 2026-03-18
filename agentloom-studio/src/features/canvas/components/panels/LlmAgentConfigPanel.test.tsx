import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTONOMY_CONFIG, type AutonomyConfig } from '../../autonomy.types'
import { createDefaultAgentNodeData, type CanvasNode } from '../../types'
import { useCanvasStore } from '../../stores/canvasStore'
import { clonePortDefinitions, getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { LlmAgentConfigPanel } from './LlmAgentConfigPanel'

const {
  mockUseAuthToken,
  mockGetOrganizationIdFromToken,
  mockUseOrganizationAutonomyPolicy,
} = vi.hoisted(() => ({
  mockUseAuthToken: vi.fn(),
  mockGetOrganizationIdFromToken: vi.fn(),
  mockUseOrganizationAutonomyPolicy: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: () => mockUseAuthToken(),
}))

vi.mock('@/features/organization-autonomy-policy/hooks/useOrganizationAutonomyPolicy', () => ({
  useOrganizationAutonomyPolicy: (...args: unknown[]) => mockUseOrganizationAutonomyPolicy(...args),
}))

vi.mock('@/features/organization-autonomy-policy/lib/organizationAutonomyPolicyPermissions', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/organization-autonomy-policy/lib/organizationAutonomyPolicyPermissions')
  >('@/features/organization-autonomy-policy/lib/organizationAutonomyPolicyPermissions')

  return {
    ...actual,
    getOrganizationIdFromToken: (...args: unknown[]) => mockGetOrganizationIdFromToken(...args),
  }
})

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
  const llmAgentType = getNodeTypeConfig('llm-agent')
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

  if (!selectedNode || selectedNode.data.nodeType !== 'llm-agent') {
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
    mockGetOrganizationIdFromToken.mockReturnValue(undefined)
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

    expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('RULE_BASED')
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.summary\ninputs.userGoal',
    )
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('USE_DEFAULT')

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
      expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('LLM_SUGGEST')
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('ABORT_EXECUTION')
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
      expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('LLM_SUGGEST')
    })
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.64)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('USE_DEFAULT')
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
      expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('RULE_BASED')
    })
    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.summary')
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('USE_DEFAULT')
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

    expect(modeSelect).toHaveValue('MANUAL_CONFIRM')
    expect(screen.queryByRole('textbox', { name: '允许推断字段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '兜底策略' })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'RULE_BASED' } })
      await Promise.resolve()
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'LLM_SUGGEST' } })
      await Promise.resolve()
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toBeInTheDocument()
    expect(screen.getByText(/建议可回退，不构成强承诺/)).toBeInTheDocument()
  })

  it('shows the organization cap and disables higher autonomy options', async () => {
    mockUseAuthToken.mockReturnValue('owner-token')
    mockGetOrganizationIdFromToken.mockReturnValue('org-1')
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
    expect(
      screen.getByRole('option', { name: 'LLM 建议（受组织策略限制）' }),
    ).toBeDisabled()
    expect(screen.getByRole('option', { name: '规则补全' })).not.toBeDisabled()
  })

  it('keeps stale over-cap modes visible and blocks autosave until downgraded', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()
    const onValidationChange = vi.fn()

    mockUseAuthToken.mockReturnValue('owner-token')
    mockGetOrganizationIdFromToken.mockReturnValue('org-1')
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

    expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('LLM_SUGGEST')
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

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: '自主模式' }), {
        target: { value: 'RULE_BASED' },
      })
      await Promise.resolve()
    })

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
    expect(screen.getByRole('combobox', { name: '自主模式' })).toHaveValue('MANUAL_CONFIRM')
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

    const modeSelect = screen.getByRole('combobox', { name: '自主模式' })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.topic\ninputs.summary.title',
    )
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('ABORT_EXECUTION')

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'MANUAL_CONFIRM' } })
      await Promise.resolve()
    })

    expect(screen.queryByRole('textbox', { name: '允许推断字段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '确认阈值' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '兜底策略' })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'LLM_SUGGEST' } })
      await Promise.resolve()
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue(
      'context.topic\ninputs.summary.title',
    )
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('ABORT_EXECUTION')
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

    const modeSelect = screen.getByRole('combobox', { name: '自主模式' })

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'MANUAL_CONFIRM' } })
      await Promise.resolve()
    })

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

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'LLM_SUGGEST' } })
      await Promise.resolve()
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.topic')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('USE_DEFAULT')
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

    const modeSelect = screen.getByRole('combobox', { name: '自主模式' })

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'MANUAL_CONFIRM' } })
      await Promise.resolve()
    })

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

    await act(async () => {
      fireEvent.change(modeSelect, { target: { value: 'LLM_SUGGEST' } })
      await Promise.resolve()
    })

    expect(screen.getByRole('textbox', { name: '允许推断字段' })).toHaveValue('context.topic')
    expect(screen.getByRole('spinbutton', { name: '确认阈值' })).toHaveValue(0.55)
    expect(screen.getByRole('combobox', { name: '兜底策略' })).toHaveValue('USE_DEFAULT')
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
