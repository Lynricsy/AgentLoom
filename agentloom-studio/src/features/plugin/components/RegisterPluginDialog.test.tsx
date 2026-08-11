import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterPluginDialog } from './RegisterPluginDialog'
import type { RegisterPluginPayload } from '../api/pluginApi'

const mocks = vi.hoisted(() => ({
  registerMutate: vi.fn(),
  isPending: false,
  notify: vi.fn(),
}))

vi.mock('../api/pluginMutations', () => ({
  useRegisterPlugin: () => ({ mutate: mocks.registerMutate, isPending: mocks.isPending }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function makeAlp(name = 'demo.alp') {
  return new File(['alp-bytes'], name, { type: 'application/zip' })
}

describe('RegisterPluginDialog', () => {
  let submitted: RegisterPluginPayload[]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isPending = false
    submitted = []
    mocks.registerMutate.mockImplementation((payload: RegisterPluginPayload) => {
      submitted.push(payload)
    })
  })

  it('拖入非 .alp 文件时拒绝并给出提示，不发起上传', async () => {
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'plugin.zip', { type: 'application/zip' })
    fireEvent.drop(screen.getByTestId('plugin-dropzone'), {
      dataTransfer: { files: [file], types: ['Files'] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '「plugin.zip」不是插件包，请选择以 .alp 结尾的文件。',
    )
    expect(screen.getByRole('button', { name: '上传并注册' })).toBeDisabled()
    expect(mocks.registerMutate).not.toHaveBeenCalled()
  })

  it('文件选择器绕过 accept 选中非 .alp 文件时同样被拒绝', async () => {
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    // userEvent.upload 会按 accept 过滤，这里直接触发 change 模拟系统选择器的「所有文件」
    fireEvent.change(screen.getByTestId('plugin-file-input'), {
      target: { files: [new File(['x'], 'plugin.tar.gz')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '「plugin.tar.gz」不是插件包',
    )
    expect(mocks.registerMutate).not.toHaveBeenCalled()
  })

  it('接受 .alp 文件后可提交，默认不带 status', async () => {
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    await userEvent.upload(screen.getByTestId('plugin-file-input'), makeAlp())
    expect(screen.getByText('demo.alp')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '上传并注册' }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]?.file.name).toBe('demo.alp')
    expect(submitted[0]?.status).toBeUndefined()
    expect(typeof submitted[0]?.onProgress).toBe('function')
  })

  it('勾选「注册后立即启用」时提交 status=active', async () => {
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    await userEvent.upload(screen.getByTestId('plugin-file-input'), makeAlp())
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '上传并注册' }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]?.status).toBe('active')
  })

  it('拖放 .alp 文件与点选等效', async () => {
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    const file = makeAlp('dropped.alp')
    const dropzone = screen.getByTestId('plugin-dropzone')
    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files'],
    }

    await userEvent.upload(screen.getByTestId('plugin-file-input'), makeAlp('picked.alp'))
    expect(screen.getByText('picked.alp')).toBeInTheDocument()

    fireEvent.drop(dropzone, { dataTransfer })

    expect(await screen.findByText('dropped.alp')).toBeInTheDocument()
  })

  it('验签失败的服务端错误展示在对话框里', async () => {
    mocks.registerMutate.mockImplementation((_payload, handlers) => {
      handlers.onError(new Error('插件签名验证失败'))
    })
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    await userEvent.upload(screen.getByTestId('plugin-file-input'), makeAlp())
    await userEvent.click(screen.getByRole('button', { name: '上传并注册' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('插件签名验证失败')
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('上传成功后提示并关闭对话框', async () => {
    const onOpenChange = vi.fn()
    mocks.registerMutate.mockImplementation((_payload, handlers) => {
      handlers.onSuccess({ name: '翻译插件', version: '1.2.0' })
    })
    render(<RegisterPluginDialog open onOpenChange={onOpenChange} />)

    await userEvent.upload(screen.getByTestId('plugin-file-input'), makeAlp())
    await userEvent.click(screen.getByRole('button', { name: '上传并注册' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ title: '插件已注册', variant: 'success' }),
      )
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('上传中展示进度条并锁住操作', () => {
    mocks.isPending = true
    render(<RegisterPluginDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByTestId('plugin-upload-progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  })
})
