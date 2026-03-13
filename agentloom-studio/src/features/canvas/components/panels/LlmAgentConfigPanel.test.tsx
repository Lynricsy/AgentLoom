import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTONOMY_CONFIG, type AutonomyConfig } from '../../autonomy.types'
import { createDefaultAgentNodeData, type CanvasNode } from '../../types'
import { useCanvasStore } from '../../stores/canvasStore'
import { clonePortDefinitions, getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { LlmAgentConfigPanel } from './LlmAgentConfigPanel'

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

function createSelectedAgentNode(
  autonomyConfig: AutonomyConfig = DEFAULT_AUTONOMY_CONFIG,
  config: Record<string, unknown> = {},
): CanvasNode {
  const llmAgentType = getNodeTypeConfig('llm-agent')

  return {
    id: 'node-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: llmAgentType.label,
      nodeType: llmAgentType.type,
      category: llmAgentType.category,
      description: llmAgentType.description,
      config,
      inputPorts: clonePortDefinitions(llmAgentType.inputPorts),
      outputPorts: clonePortDefinitions(llmAgentType.outputPorts),
      ...createDefaultAgentNodeData(),
      autonomyConfig: { ...autonomyConfig },
    },
  }
}

function setSelectedAgentNode(
  autonomyConfig: AutonomyConfig = DEFAULT_AUTONOMY_CONFIG,
  config: Record<string, unknown> = {},
) {
  useCanvasStore.setState({
    nodes: [createSelectedAgentNode(autonomyConfig, config)],
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
      config: {
        systemPrompt: '先建议，再等待确认',
        outputSchemaTitle: 'SuggestionSchema',
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

    expect(useCanvasStore.getState().nodes[0]?.data.autonomyConfig).toEqual(DEFAULT_AUTONOMY_CONFIG)

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

  it('keeps existing fields autosave behavior while writing a full autonomyConfig payload', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()

    setSelectedAgentNode(DEFAULT_AUTONOMY_CONFIG, {
      systemPrompt: '初始系统提示词',
      outputSchemaTitle: 'InitialSchema',
    })

    render(
      <LlmAgentConfigPanel
        config={{
          systemPrompt: '初始系统提示词',
          outputSchemaTitle: 'InitialSchema',
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
      config: {
        systemPrompt: '初始系统提示词',
        outputSchemaTitle: 'UpdatedSchema',
      },
      autonomyConfig: DEFAULT_AUTONOMY_CONFIG,
    })
  })
})
