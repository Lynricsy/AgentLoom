import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from './MarkdownRenderer'

vi.mock('./MermaidBlock', () => ({
  MermaidBlock: ({ code }: { code: string }) => (
    <div data-testid="mock-mermaid-block">{code}</div>
  ),
}))

describe('MarkdownRenderer', () => {
  it('renders markdown with KaTeX, Mermaid and code blocks', () => {
    const { container } = render(
      <MarkdownRenderer
        content={[
          '# 输出标题',
          '',
          '$$E=mc^2$$',
          '',
          '```mermaid',
          'graph TD',
          'A-->B',
          '```',
          '',
          '```ts',
          'const answer = 42',
          '```',
        ].join('\n')}
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: '输出标题',
      }),
    ).toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(screen.getByTestId('mock-mermaid-block')).toHaveTextContent('graph TD')
    expect(container.querySelector('code')?.textContent).toContain('const answer = 42')
  })
})
