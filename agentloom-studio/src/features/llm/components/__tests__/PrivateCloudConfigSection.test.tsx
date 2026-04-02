import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ReactNode } from 'react'
import { PrivateCloudConfigSection } from '../PrivateCloudConfigSection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const formSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
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
  timeoutMs: z.number().int().min(5000).max(600000).optional(),
}).superRefine((values, ctx) => {
  if (values.provider !== 'private_cloud') {
    return
  }

  if (!values.endpointUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endpointUrl'],
      message: '请输入私有云端点 URL',
    })
  }

  if (!values.authMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authMethod'],
      message: '请选择认证方式',
    })
  }

  if (values.authMethod === 'api_key' && !values.apiKeyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKeyId'],
      message: '请选择 API Key',
    })
  }
})

type FormValues = z.infer<typeof formSchema>

const testConnectionMock = vi.fn()
const fetchModelsMock = vi.fn()

const mockApiKeys = [
  { id: '11111111-1111-1111-8111-111111111111', provider: 'private_cloud', label: 'My vLLM Key', keyPreview: 'sk-...abc', isDefault: false, status: 'active' as const },
  { id: '22222222-2222-2222-8222-222222222222', provider: 'private_cloud', label: 'Backup Key', keyPreview: 'sk-...xyz', isDefault: false, status: 'active' as const },
]

vi.mock('../../hooks/useLlmModels', () => ({
  useTestPrivateCloudConnection: () => ({
    mutateAsync: testConnectionMock,
    isPending: false,
  }),
  usePrivateCloudModels: () => ({
    mutateAsync: fetchModelsMock,
    isPending: false,
  }),
  useLlmApiKeys: () => ({
    data: mockApiKeys,
    isLoading: false,
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

  it('测试连接成功后显示成功状态、服务器版本和获取模型按钮', async () => {
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
      expect(screen.getByTestId('connection-status')).toHaveTextContent('版本 0.1.0')
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

  it('选择 api_key 认证方式时显示 API Key 选择器', () => {
    render(
      <FormWrapper defaultValues={{ authMethod: 'api_key' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('api-key-auth-section')).toBeInTheDocument()
    expect(screen.getByTestId('api-key-select')).toBeInTheDocument()
  })

  it('api_key 模式未选择 API Key 时禁用连接测试并显示提示', () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: 'https://my-vllm:8000/v1', authMethod: 'api_key' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('test-connection-btn')).toBeDisabled()
    expect(screen.getByText('请选择 API Key 以测试连接或获取模型。')).toBeInTheDocument()
  })

  it('选择 mtls 认证方式时显示即将支持提示', () => {
    render(
      <FormWrapper defaultValues={{ authMethod: 'mtls' }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    expect(screen.getByTestId('mtls-auth-section')).toBeInTheDocument()
    expect(screen.getByTestId('mtls-auth-section')).toHaveTextContent('即将支持')
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

  it('使用 api_key 认证方式时连接测试携带 apiKeyId', async () => {
    render(
      <FormWrapper defaultValues={{
        endpointUrl: 'https://my-vllm:8000/v1',
        authMethod: 'api_key',
        apiKeyId: '11111111-1111-1111-8111-111111111111',
      }}>
        <PrivateCloudConfigSection />
      </FormWrapper>,
    )

    fireEvent.click(screen.getByTestId('test-connection-btn'))

    await waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: 'https://my-vllm:8000/v1',
          authMethod: 'api_key',
          apiKeyId: '11111111-1111-1111-8111-111111111111',
        }),
      )
    })
  })
})
