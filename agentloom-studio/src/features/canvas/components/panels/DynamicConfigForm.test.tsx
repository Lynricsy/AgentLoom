import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NodeConfigSchema } from '../../types/nodeTypeRegistry'
import { DynamicConfigForm } from './DynamicConfigForm'

const sampleSchema: NodeConfigSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: '名称',
      description: '节点名称',
    },
    method: {
      type: 'string',
      title: '请求方法',
      enum: ['GET', 'POST'],
    },
    retries: {
      type: 'number',
      title: '重试次数',
      default: 3,
    },
    enabled: {
      type: 'boolean',
      title: '启用开关',
    },
  },
  required: ['name'],
}

describe('DynamicConfigForm', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles the empty schema path by not rendering the form body', () => {
    render(
      <DynamicConfigForm
        configSchema={{ type: 'object', properties: {}, required: [] }}
        values={{}}
        onApply={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('dynamic-config-form')).not.toBeInTheDocument()
  })

  it('renders string, enum, number, and boolean fields from the schema', () => {
    render(
      <DynamicConfigForm
        configSchema={sampleSchema}
        values={{ enabled: true }}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByTestId('dynamic-config-form')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '名称' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '请求方法' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '重试次数' })).toHaveValue(3)
    expect(screen.getByRole('checkbox', { name: '启用开关' })).toBeChecked()
  })

  it('shows required validation on blur with the story error text', async () => {
    const onValidationChange = vi.fn()

    render(
      <DynamicConfigForm
        configSchema={sampleSchema}
        values={{}}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    const input = screen.getByRole('textbox', { name: '名称' })

    fireEvent.focus(input)
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText('此字段为必填项')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(true)
    })
  })

  it('surfaces all required-field errors when one required field blurs', async () => {
    const onValidationChange = vi.fn()

    render(
      <DynamicConfigForm
        configSchema={{
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
              title: '名字',
            },
            lastName: {
              type: 'string',
              title: '姓氏',
            },
          },
          required: ['firstName', 'lastName'],
        }}
        values={{}}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    const firstNameInput = screen.getByRole('textbox', { name: '名字' })

    fireEvent.focus(firstNameInput)
    fireEvent.blur(firstNameInput)

    await waitFor(() => {
      expect(screen.getAllByText('此字段为必填项')).toHaveLength(2)
    })

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(true)
    })
  })

  it('debounces changes before calling onApply', async () => {
    vi.useFakeTimers()
    const onApply = vi.fn()

    render(
      <DynamicConfigForm
        configSchema={sampleSchema}
        values={{}}
        onApply={onApply}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
      target: { value: 'HTTP 节点' },
    })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onApply).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          name: 'HTTP 节点',
        }),
      }),
    )
  })

  it('reports validation state changes as fields become invalid and valid again', async () => {
    const onValidationChange = vi.fn()
    const user = userEvent.setup()

    render(
      <DynamicConfigForm
        configSchema={sampleSchema}
        values={{}}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    const input = screen.getByRole('textbox', { name: '名称' })

    expect(onValidationChange).toHaveBeenLastCalledWith(false)

    fireEvent.focus(input)
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(true)
    })

    await user.type(input, '有效名称')
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(false)
    })
  })
})
