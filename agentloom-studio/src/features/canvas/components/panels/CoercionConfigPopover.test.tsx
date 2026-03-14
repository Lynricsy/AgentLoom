import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CoercionConfigPopover } from './CoercionConfigPopover'

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

describe('CoercionConfigPopover', () => {
  it('renders trigger button when strategies available', () => {
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('coercion-config-trigger')).toBeInTheDocument()
  })

  it('does not render when no strategies available', () => {
    render(
      <CoercionConfigPopover
        sourceType="image"
        targetType="audio"
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('coercion-config-trigger')).not.toBeInTheDocument()
  })

  it('shows strategy list on trigger click', () => {
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    expect(screen.getByTestId('coercion-config-popover')).toBeInTheDocument()
    expect(screen.getByTestId('coercion-strategy-JSON.parse')).toBeInTheDocument()
  })

  it('calls onChange with strategy on selection', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.click(screen.getByTestId('coercion-strategy-JSON.parse'))
    expect(onChange).toHaveBeenCalledWith({ strategy: 'JSON.parse' })
  })

  it('highlights active strategy', () => {
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        value={{ strategy: 'JSON.parse' }}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    const item = screen.getByTestId('coercion-strategy-JSON.parse')
    expect(item.className).toContain('selected')
  })

  it('shows clear button when value is set', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        value={{ strategy: 'JSON.parse' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.click(screen.getByTestId('coercion-clear'))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('shows precision param for toFixed strategy', () => {
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        value={{ strategy: 'toFixed', params: { precision: 2 } }}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    expect(screen.getByTestId('coercion-param-toFixed')).toBeInTheDocument()
    expect(screen.getByTestId('coercion-precision-input')).toHaveValue(2)
  })

  it('updates precision param', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        value={{ strategy: 'toFixed', params: { precision: 2 } }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.change(screen.getByTestId('coercion-precision-input'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith({ strategy: 'toFixed', params: { precision: 4 } })
  })

  it('shows separator param for join strategy', () => {
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        value={{ strategy: 'join', params: { separator: ',' } }}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    expect(screen.getByTestId('coercion-param-join')).toBeInTheDocument()
    expect(screen.getByTestId('coercion-separator-input')).toHaveValue(',')
  })

  it('updates separator param', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        value={{ strategy: 'join', params: { separator: ',' } }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.change(screen.getByTestId('coercion-separator-input'), { target: { value: ' | ' } })
    expect(onChange).toHaveBeenCalledWith({ strategy: 'join', params: { separator: ' | ' } })
  })

  it('sets default params when selecting toFixed', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.click(screen.getByTestId('coercion-strategy-toFixed'))
    expect(onChange).toHaveBeenCalledWith({ strategy: 'toFixed', params: { precision: 2 } })
  })

  it('sets default params when selecting join', () => {
    const onChange = vi.fn()
    render(
      <CoercionConfigPopover
        sourceType="json"
        targetType="text"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('coercion-config-trigger'))
    fireEvent.click(screen.getByTestId('coercion-strategy-join'))
    expect(onChange).toHaveBeenCalledWith({ strategy: 'join', params: { separator: ',' } })
  })

  it('marks trigger as active when config is set', () => {
    render(
      <CoercionConfigPopover
        sourceType="text"
        targetType="json"
        value={{ strategy: 'JSON.parse' }}
        onChange={vi.fn()}
      />,
    )
    const trigger = screen.getByTestId('coercion-config-trigger')
    expect(trigger.className).toContain('active')
  })
})
