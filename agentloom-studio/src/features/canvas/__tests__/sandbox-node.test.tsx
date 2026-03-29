import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_TYPE_REGISTRY } from '../types/nodeTypeRegistry'
import { SandboxConfigPanel } from '../components/panels/SandboxConfigPanel'

const mockUsePersistentSandboxes = vi.fn()

vi.mock('@/features/sandbox/api/sandboxQueries', () => ({
  usePersistentSandboxes: () => mockUsePersistentSandboxes(),
}))

vi.mock('@/features/sandbox/components/SandboxPresetSelector', () => ({
  SandboxPresetSelector: () => <div>Preset Selector</div>,
}))

vi.mock('@/features/sandbox/stores/sandboxPresetStore', () => ({
  useSandboxPresetStore: () => vi.fn(),
  getAllPresets: () => [],
  findMatchingPreset: () => undefined,
}))

describe('sandbox node registry', () => {
  const sandboxConfig = NODE_TYPE_REGISTRY.sandbox

  beforeEach(() => {
    mockUsePersistentSandboxes.mockReturnValue({
      data: [],
      isLoading: false,
    })
  })

  it('exists in NODE_TYPE_REGISTRY with correct type and category', () => {
    expect(sandboxConfig).toBeDefined()
    expect(sandboxConfig.type).toBe('sandbox')
    expect(sandboxConfig.category).toBe('tool')
    expect(sandboxConfig.label).toBe('Sandbox')
    expect(sandboxConfig.icon).toBe('Container')
  })

  it('has a volume input port for workspace mounting', () => {
    expect(sandboxConfig.inputPorts).toHaveLength(1)
    expect(sandboxConfig.inputPorts[0]).toMatchObject({
      id: 'volume-in',
      dataType: 'volume',
      direction: 'input',
    })
  })

  it('has a sandbox output port with correct config', () => {
    expect(sandboxConfig.outputPorts).toHaveLength(1)
    const output = sandboxConfig.outputPorts[0]!
    expect(output.id).toBe('sandbox-output')
    expect(output.dataType).toBe('sandbox')
    expect(output.direction).toBe('output')
    expect(output.multiple).toBe(true)
    expect(output.maxConnections).toBeNull()
  })
})

describe('SandboxConfigPanel', () => {
  it('renders all config fields with default values', () => {
    render(<SandboxConfigPanel config={{}} onApply={vi.fn()} />)

    expect(screen.getByText('Preset Selector')).toBeInTheDocument()
    expect(screen.getByLabelText('CPU 滑块')).toBeInTheDocument()
    expect(screen.getByLabelText('CPU 数值')).toBeInTheDocument()
    expect(screen.getByLabelText('Memory 滑块')).toBeInTheDocument()
    expect(screen.getByLabelText('Memory 数值')).toBeInTheDocument()
    expect(screen.getByLabelText('Disk 滑块')).toBeInTheDocument()
    expect(screen.getByLabelText('Disk 数值')).toBeInTheDocument()
    expect(screen.getByLabelText('Timeout 滑块')).toBeInTheDocument()
    expect(screen.getByLabelText('Timeout 数值')).toBeInTheDocument()
  })

  it('displays current config values in summary', () => {
    render(
      <SandboxConfigPanel
        config={{ cpu: 2, memory: 1024, disk: 5, timeout: 4 }}
        onApply={vi.fn()}
      />,
    )

    const summary = screen.getByText('当前配置').parentElement!
    expect(summary.textContent).toContain('2')
    expect(summary.textContent).toContain('1024')
    expect(summary.textContent).toContain('5')
    expect(summary.textContent).toContain('4')
    expect(within(summary).getByText('临时')).toBeInTheDocument()
  })

  it('calls onApply when cpu slider is changed', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const cpuInput = screen.getByLabelText('CPU 滑块')
    fireEvent.change(cpuInput, { target: { value: '2' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ cpu: 2 }),
    })
  })

  it('calls onApply when timeout number input is changed', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const timeoutInput = screen.getByLabelText('Timeout 数值')
    fireEvent.change(timeoutInput, { target: { value: '6' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ timeout: 6 }),
    })
  })

  it('calls onApply when switching to persistent mode', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    fireEvent.click(screen.getByRole('button', { name: '持久' }))

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ lifecycleMode: 'persistent' }),
    })
  })

  it('clamps cpu to min boundary when slider value is below min', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const cpuInput = screen.getByLabelText('CPU 滑块')
    fireEvent.change(cpuInput, { target: { value: '0.1' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ cpu: 0.5 }),
    })
  })

  it('clamps memory to max boundary when slider value exceeds max', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const memoryInput = screen.getByLabelText('Memory 滑块')
    fireEvent.change(memoryInput, { target: { value: '9999' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ memory: 4096 }),
    })
  })

  it('在持久模式下展示当前已选沙箱名称', () => {
    render(
      <SandboxConfigPanel
        config={{
          lifecycleMode: 'persistent',
          persistentSandboxId: 'sandbox-1',
          persistentSandboxName: 'Shared Sandbox',
        }}
        onApply={vi.fn()}
      />,
    )

    const summary = screen.getByText('当前配置').parentElement!

    expect(screen.getByText('选择持久沙箱')).toBeInTheDocument()
    expect(within(summary).getByText('Shared Sandbox')).toBeInTheDocument()
    expect(within(summary).getByText('持久')).toBeInTheDocument()
    expect(screen.queryByText('Preset Selector')).not.toBeInTheDocument()
  })
})
