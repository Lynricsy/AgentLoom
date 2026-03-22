import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphSearchBar } from '../GraphSearchBar'

describe('GraphSearchBar', () => {
  it('渲染搜索输入框', () => {
    render(<GraphSearchBar onSearch={vi.fn()} />)
    expect(screen.getByTestId('graph-search-input')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索节点...')).toBeInTheDocument()
  })

  it('输入时触发 onSearch 回调', () => {
    const onSearch = vi.fn()
    render(<GraphSearchBar onSearch={onSearch} />)
    const input = screen.getByTestId('graph-search-input')
    fireEvent.change(input, { target: { value: '测试' } })
    expect(onSearch).toHaveBeenCalledWith('测试')
  })

  it('输入内容后显示清除按钮', () => {
    render(<GraphSearchBar onSearch={vi.fn()} />)
    const input = screen.getByTestId('graph-search-input')

    // 初始无清除按钮
    expect(screen.queryByTestId('graph-search-clear')).not.toBeInTheDocument()

    // 输入后出现
    fireEvent.change(input, { target: { value: '测试' } })
    expect(screen.getByTestId('graph-search-clear')).toBeInTheDocument()
  })

  it('点击清除按钮重置搜索', () => {
    const onSearch = vi.fn()
    render(<GraphSearchBar onSearch={onSearch} />)
    const input = screen.getByTestId('graph-search-input')
    fireEvent.change(input, { target: { value: '测试' } })

    const clearBtn = screen.getByTestId('graph-search-clear')
    fireEvent.click(clearBtn)

    expect(onSearch).toHaveBeenLastCalledWith('')
    expect(input).toHaveValue('')
  })

  it('按 Escape 键清除搜索', () => {
    const onSearch = vi.fn()
    render(<GraphSearchBar onSearch={onSearch} />)
    const input = screen.getByTestId('graph-search-input')
    fireEvent.change(input, { target: { value: '测试' } })

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSearch).toHaveBeenLastCalledWith('')
    expect(input).toHaveValue('')
  })
})
