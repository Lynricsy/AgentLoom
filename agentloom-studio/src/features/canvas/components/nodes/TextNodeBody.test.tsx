import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextNodeBody } from './TextNodeBody'

describe('TextNodeBody', () => {
  it('在未配置文本时显示占位态', () => {
    render(<TextNodeBody config={{}} />)

    expect(screen.getByText('输入文本内容')).toBeInTheDocument()
  })

  it('显示文本预览', () => {
    render(
      <TextNodeBody
        config={{
          text: '你是一个严谨的代码审查助手，需要先列出高风险问题，再给出收敛建议。',
        }}
      />,
    )

    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(
      screen.getByText(/你是一个严谨的代码审查助手，需要先列出高风险问题/),
    ).toBeInTheDocument()
  })
})
