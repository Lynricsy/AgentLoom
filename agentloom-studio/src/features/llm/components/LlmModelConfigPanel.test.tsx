import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateLlmModelInput, LlmModelInfo } from '../types'
import { LlmModelConfigPanel } from './LlmModelConfigPanel'

const mocks = vi.hoisted(() => ({
  useLlmModels: vi.fn(),
  useLlmProviders: vi.fn(),
  useLlmApiKeys: vi.fn(),
  useCreateLlmModel: vi.fn(),
  useUpdateLlmModel: vi.fn(),
  notify: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}))

vi.mock('../hooks/useLlmModels', () => ({
  useLlmModels: mocks.useLlmModels,
  useLlmProviders: mocks.useLlmProviders,
  useLlmApiKeys: mocks.useLlmApiKeys,
  useCreateLlmModel: mocks.useCreateLlmModel,
  useUpdateLlmModel: mocks.useUpdateLlmModel,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({
    notify: mocks.notify,
  }),
}))

function createLlmModel(overrides: Partial<LlmModelInfo> = {}): LlmModelInfo {
  return {
    id: 'cfg-1',
    name: 'OpenAI 主模型',
    provider: 'openai',
    modelName: 'gpt-4o',
    parameters: {
      temperature: 0.7,
      maxTokens: undefined,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: [],
    },
    apiKeyId: null,
    isDefault: false,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('LlmModelConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useLlmModels.mockReturnValue({
      data: [createLlmModel()],
      isLoading: false,
      error: null,
    })
    mocks.useLlmProviders.mockReturnValue({
      data: undefined,
      error: null,
    })
    mocks.useLlmApiKeys.mockReturnValue({
      data: [],
      error: null,
    })
    mocks.useCreateLlmModel.mockReturnValue({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
      error: null,
    })
    mocks.useUpdateLlmModel.mockReturnValue({
      mutateAsync: mocks.updateMutateAsync,
      isPending: false,
      error: null,
    })
  })

  it('选择已有配置时立即写回节点 patch', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(<LlmModelConfigPanel config={null} onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: '选择已有配置' }))
    await user.selectOptions(screen.getByRole('combobox'), 'cfg-1')

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          llmConfigId: 'cfg-1',
          provider: 'openai',
          modelName: 'gpt-4o',
          name: 'OpenAI 主模型',
        }),
        llmConfigId: 'cfg-1',
        modelId: 'gpt-4o',
        name: 'OpenAI 主模型',
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKeyId: null,
        isDefault: false,
        parameters: {
          temperature: 0.7,
          maxTokens: undefined,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stop: [],
        },
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        label: 'gpt-4o',
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '已应用模型配置',
        variant: 'success',
      }),
    )
  })

  it('创建新配置后调用 create mutation 并写回节点 patch', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const savedModel = createLlmModel({
      id: 'cfg-2',
      name: '新建 OpenAI 配置',
    })

    mocks.createMutateAsync.mockResolvedValue(savedModel)

    render(<LlmModelConfigPanel config={null} onApply={onApply} />)

    await user.clear(screen.getByPlaceholderText('例如：OpenAI 主模型'))
    await user.type(screen.getByPlaceholderText('例如：OpenAI 主模型'), '新建 OpenAI 配置')
    await user.click(screen.getByRole('button', { name: '保存并应用新配置' }))

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({
        name: '新建 OpenAI 配置',
        provider: 'openai',
        modelName: 'gpt-4o',
        parameters: {
          temperature: 0.7,
          maxTokens: undefined,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stop: [],
        },
        isDefault: false,
      } satisfies CreateLlmModelInput)
    })

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          llmConfigId: 'cfg-2',
          provider: 'openai',
          modelName: 'gpt-4o',
          name: '新建 OpenAI 配置',
        }),
        llmConfigId: 'cfg-2',
        modelId: 'gpt-4o',
        name: '新建 OpenAI 配置',
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKeyId: null,
        isDefault: false,
        parameters: savedModel.parameters,
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        label: 'gpt-4o',
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'LLM 配置已保存',
        variant: 'success',
      }),
    )
  })
})
