import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ReactNode } from 'react'
import { LLM_PROVIDER_IDS } from '../../types'
import { PrivateCloudConfigSection } from '../PrivateCloudConfigSection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const formSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(LLM_PROVIDER_IDS),
  modelName: z.string(),
  apiKeyId: z.union([z.literal(''), z.string().regex(UUID_PATTERN)]),
  temperature: z.number(),
  maxTokens: z.string(),
  topP: z.number(),
  frequencyPenalty: z.number(),
  presencePenalty: z.number(),
  stop: z.array(z.string()),
  endpointUrl: z.string().url().optional().or(z.literal('')),
  authMethod: z.enum(['api_key', 'mtls', 'none']).optional(),
  authConfig: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
})

type FormValues = z.infer<typeof formSchema>

const testConnectionMock = vi.fn()
const fetchModelsMock = vi.fn()

vi.mock('../../hooks/useLlmModels', () => ({
  useTestPrivateCloudConnection: () => ({
    mutateAsync: testConnectionMock,
    isPending: false,
  }),
  usePrivateCloudModels: () => ({
    mutateAsync: fetchModelsMock,
    isPending: false,
  }),
}))

function FormWrapper({ children, defaultValues }: { children: ReactNode; defaultValues?: Partial<FormValues> }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as never,
    defaultValues: {
      name: 'test',
      provider: 'private_cloud',
      modelName: '',
      apiKeyId: '',
      temperature: 0.7,
      maxTokens: '',
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: [],
      endpointUrl: '',
      authMethod: 'none',
      authConfig: {},
      ...defaultValues,
    },
  })

  return <FormProvider {...form}>{children}</FormProvider>
}

describe('PrivateCloudConfigSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testConnectionMock.mockResolvedValue({
      success: true,
      latencyMs: 42,
      serverInfo: { models: ['llama-3'], version: '0.1.0' },
    })
    fetchModelsMock.mockResolvedValue([
      { id: 'llama-3-70b', name: 'Llama 3 70B', ownedBy: 'meta' },
      { id: 'qwen-2.5-72b', name: 'Qwen 2.5 72B' },
    ])
  })

  it('渲染所有基本表单字段', () => {
    render(
      <FormWrapper>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('private-cloud-config-section')).toBeInTheDocument()
    expect(screen.getByTestId('endpoint-url-input')).toBeInTheDocument()
    expect(screen.getByTestId('auth-method-select')).toBeInTheDocument()
    expect(screen.getByTestId('timeout-input')).toBeInTheDocument()
    expect(screen.getByTestId('test-connection-btn')).toBeInTheDocument()
  })

  it('端点 URL 为空时测试连接按钮禁用', () => {
    render(
      <FormWrapper>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('test-connection-btn')).toBeDisabled()
  })

  it('输入端点 URL 后启用测试连接按钮', () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('test-connection-btn')).toBeEnabled()
  })

  it('测试连接成功后显示成功状态和获取模型按钮', async () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: 'https://my-vllm:8000/v1',
          authMethod: 'none',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('连接成功')
      expect(screen.getByTestId('connection-status')).toHaveTextContent('42ms')
    })

    expect(screen.getByTestId('fetch-models-btn')).toBeInTheDocument()
  })

  it('测试连接失败后显示错误信息', async () => {
    testConnectionMock.mockResolvedValue({ success: false, latencyMs: 0 })

    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://bad-server:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('连接失败')
    })
  })

  it('测试连接抛出异常时显示错误信息', async () => {
    testConnectionMock.mockRejectedValue(new Error('网络超时'))

    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://timeout-server:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('网络超时')
    })
  })

  it('获取模型列表后渲染模型选择器', async () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('fetch-models-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('fetch-models-btn'))

    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: 'https://my-vllm:8000/v1',
          authMethod: 'none',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('remote-models-section')).toBeInTheDocument()
      expect(screen.getByTestId('remote-model-select')).toBeInTheDocument()
    })
  })

  it('连接成功但无远程模型时显示手动输入框', async () => {
    fetchModelsMock.mockResolvedValue([])

    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('connection-status')).toHaveTextContent('连接成功')
    })

    fireEvent.click(screen.getByTestId('fetch-models-btn'))

    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByTestId('manual-model-input')).toBeInTheDocument()
    })
  })

  it('选择 api_key 认证方式时显示 API Key 输入框', () => {
    render(
      <FormWrapper defaultValues={{ authMethod: 'api_key' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('api-key-auth-section')).toBeInTheDocument()
    expect(screen.getByTestId('auth-api-key-input')).toBeInTheDocument()
  })

  it('选择 mtls 认证方式时显示证书路径输入框', () => {
    render(
      <FormWrapper defaultValues={{ authMethod: 'mtls' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('mtls-auth-section')).toBeInTheDocument()
  })

  it('选择 none 认证方式时不显示额外认证字段', () => {
    render(
      <FormWrapper defaultValues={{ authMethod: 'none' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.queryByTestId('api-key-auth-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mtls-auth-section')).not.toBeInTheDocument()
  })

  it('获取到模型列表后自动选中第一个模型', async () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1', modelName: '' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('fetch-models-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('fetch-models-btn'))

    await waitFor(() => {
      const select = screen.getByTestId('remote-model-select') as HTMLSelectElement
      expect(select.value).toBe('llama-3-70b')
    })
  })
})
