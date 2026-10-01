import { runInNewContext } from 'node:vm'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputPreprocessorConfigPanel } from './InputPreprocessorConfigPanel'

describe('InputPreprocessorConfigPanel', () => {
  it('脚本模式占位符按服务端语义可直接运行：vm.Script 求值，input 以端口 ID 为键', () => {
    render(
      <InputPreprocessorConfigPanel config={{ transformType: 'script' }} onApply={vi.fn()} />,
    )

    const placeholder = screen.getByLabelText('转换表达式').getAttribute('placeholder') ?? ''
    const script = placeholder.replace(/^例：/, '')

    // 与 input-preprocessor.handler.ts 的 executeScript 相同：new Script(expression).runInContext，结果取最后一个表达式的值
    expect(runInNewContext(script, { input: { 'text-in': '  hello  ' } })).toBe('HELLO')
  })
})
