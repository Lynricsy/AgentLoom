import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { SandboxNodeBody } from './SandboxNodeBody'

function createSandboxNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'My Sandbox',
    nodeType: 'sandbox',
    category: 'tool',
    config: { cpu: 2, memory: 1024, disk: 5, timeout: 2 },
    inputPorts: [],
    outputPorts: [
      {
        id: 'sandbox-output',
        label: 'Sandbox',
        direction: 'output' as const,
        dataType: 'sandbox' as const,
        required: false,
        multiple: true,
        maxConnections: null,
        schema: { kind: 'sandbox' as const, title: 'Sandbox' },
      },
    ],
    description: 'A test sandbox description',
    ...overrides,
  }
}

describe('SandboxNodeBody', () => {
  it('renders sandbox badge', () => {
    render(<SandboxNodeBody data={createSandboxNodeData()} />)
    expect(screen.getByText('Sandbox')).toBeInTheDocument()
  })

  it('renders config info', () => {
    render(<SandboxNodeBody data={createSandboxNodeData()} />)
    expect(screen.getByText('2C / 1024M / 5G')).toBeInTheDocument()
  })

  it('renders description when present', () => {
    render(
      <SandboxNodeBody data={createSandboxNodeData({ description: 'My sandbox description' })} />,
    )
    expect(screen.getByText('My sandbox description')).toBeInTheDocument()
  })

  it('hides description when absent', () => {
    render(<SandboxNodeBody data={createSandboxNodeData({ description: undefined })} />)
    expect(screen.queryByText('A test sandbox description')).not.toBeInTheDocument()
  })

  it('shows port counts when ports exist', () => {
    render(<SandboxNodeBody data={createSandboxNodeData()} />)
    expect(screen.getByText('0入 / 1出')).toBeInTheDocument()
  })

  it('hides port counts when no ports', () => {
    render(<SandboxNodeBody data={createSandboxNodeData({ inputPorts: [], outputPorts: [] })} />)
    expect(screen.queryByText(/入/)).not.toBeInTheDocument()
  })
})
