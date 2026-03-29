import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentNodePalette } from './AgentNodePalette'

describe('AgentNodePalette', () => {
  it('shows memory nodes in the palette', () => {
    render(<AgentNodePalette />)

    expect(screen.getByText('记忆')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Memory图谱记忆实例节点/i })).toBeInTheDocument()
  })
})
