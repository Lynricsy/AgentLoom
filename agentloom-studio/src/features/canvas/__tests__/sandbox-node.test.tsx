import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NODE_TYPE_REGISTRY } from '../types/nodeTypeRegistry'
import { SandboxConfigPanel } from '../components/panels/SandboxConfigPanel'

describe('sandbox node registry', () => {
  const sandboxConfig = NODE_TYPE_REGISTRY.sandbox

  it('exists in NODE_TYPE_REGISTRY with correct type and category', () => {
    expect(sandboxConfig).toBeDefined()
    expect(sandboxConfig.type).toBe('sandbox')
    expect(sandboxConfig.category).toBe('tool')
    expect(sandboxConfig.label).toBe('Sandbox')
    expect(sandboxConfig.icon).toBe('Container')
  })

  it('has no input ports', () => {
    expect(sandboxConfig.inputPorts).toHaveLength(0)
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

    expect(screen.getByLabelText(/CPU/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Memory/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Disk/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Persistence Path/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Timeout/)).toBeInTheDocument()
  })

  it('displays current config values in summary', () => {
    render(
      <SandboxConfigPanel
        config={{ cpu: 2, memory: 1024, disk: 5, persistencePath: '/my/path', timeout: 4 }}
        onApply={vi.fn()}
      />,
    )

    const summary = screen.getByText('当前配置').parentElement!
    expect(summary.textContent).toContain('2')
    expect(summary.textContent).toContain('1024')
    expect(summary.textContent).toContain('5')
    expect(summary.textContent).toContain('4')
    expect(screen.getByText('Path: /my/path')).toBeInTheDocument()
  })

  it('calls onApply when cpu slider is changed', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const cpuInput = screen.getByLabelText(/CPU/)
    fireEvent.change(cpuInput, { target: { value: '2' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ cpu: 2 }),
    })
  })

  it('calls onApply when persistence path is changed', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const pathInput = screen.getByLabelText(/Persistence Path/)
    fireEvent.change(pathInput, { target: { value: '/workspace' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ persistencePath: '/workspace' }),
    })
  })

  it('clamps cpu to min boundary when slider value is below min', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const cpuInput = screen.getByLabelText(/CPU/)
    fireEvent.change(cpuInput, { target: { value: '0.1' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ cpu: 0.5 }),
    })
  })

  it('clamps memory to max boundary when slider value exceeds max', () => {
    const onApply = vi.fn()
    render(<SandboxConfigPanel config={{}} onApply={onApply} />)

    const memoryInput = screen.getByLabelText(/Memory/)
    fireEvent.change(memoryInput, { target: { value: '9999' } })

    expect(onApply).toHaveBeenCalledWith({
      config: expect.objectContaining({ memory: 4096 }),
    })
  })
})
