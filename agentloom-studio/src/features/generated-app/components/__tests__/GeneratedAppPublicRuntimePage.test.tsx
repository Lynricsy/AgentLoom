import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HTTPError } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GeneratedAppPublicRuntime,
  GeneratedAppPublicSubmission,
  GeneratedAppRuntimeForm,
} from '../../types'
import { GeneratedAppPublicRuntimePage } from '../GeneratedAppPublicRuntimePage'

const {
  createPublicSubmissionMutation,
  publicRuntimeQuery,
  publicSubmissionQuery,
  useGeneratedAppPublicRuntimeMock,
  useGeneratedAppPublicSubmissionMock,
} = vi.hoisted(() => ({
  createPublicSubmissionMutation: {
    mutateAsync: vi.fn(),
    data: undefined as unknown,
    isPending: false,
  },
  publicRuntimeQuery: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  publicSubmissionQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  useGeneratedAppPublicRuntimeMock: vi.fn(),
  useGeneratedAppPublicSubmissionMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useCreateGeneratedAppPublicSubmission: () => createPublicSubmissionMutation,
  useGeneratedAppPublicRuntime: (token: string | undefined) => {
    useGeneratedAppPublicRuntimeMock(token)
    return publicRuntimeQuery
  },
  useGeneratedAppPublicSubmission: (
    token: string | undefined,
    submissionId: string | undefined,
  ) => {
    useGeneratedAppPublicSubmissionMock(token, submissionId)
    return publicSubmissionQuery
  },
}))

function makeRuntimeForm(
  overrides: Partial<GeneratedAppRuntimeForm> = {},
): GeneratedAppRuntimeForm {
  return {
    formId: 'docs-qa-form',
    title: '文档问答',
    description: '输入问题，基于产品文档回答并给出引用。',
    submitLabel: '提问',
    fields: [
      {
        id: 'question',
        label: '问题',
        type: 'textarea',
        required: true,
        placeholder: '例如：工作流有哪几种状态？',
        helpText: '只回答文档里有的内容。',
        maxLength: 500,
      },
      {
        id: 'topK',
        label: '引用条数',
        type: 'number',
        required: false,
        placeholder: '',
        helpText: '',
        min: 1,
        max: 5,
      },
      {
        id: 'tone',
        label: '回答风格',
        type: 'single_select',
        required: true,
        placeholder: '',
        helpText: '',
        options: [
          { value: 'brief', label: '简短' },
          { value: 'detailed', label: '详细' },
        ],
      },
      {
        id: 'topics',
        label: '关注主题',
        type: 'multi_select',
        required: false,
        placeholder: '',
        helpText: '',
        options: [
          { value: 'workflow', label: '工作流' },
          { value: 'agent', label: 'Agent' },
        ],
      },
    ],
    resultView: {
      title: '回答',
      emptyState: '提交后在这里显示答案与引用。',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
        { id: 'raw', label: '原始输出', format: 'json' },
        { id: 'note', label: '备注', format: 'text' },
      ],
    },
    ...overrides,
  }
}

function makePublicRuntime(
  overrides: Partial<GeneratedAppPublicRuntime> = {},
): GeneratedAppPublicRuntime {
  return {
    token: 'public-token-with-a-very-long-value',
    appId: 'app-public',
    title: '文档问答助手',
    description: '基于产品文档回答问题。',
    dataUseNotice: '提交内容与结果会被保存，并提供给应用创建者查看。',
    appSpec: {
      version: 2,
      appName: '文档问答助手',
      summary: '输入问题，返回答案与文档引用。',
      userGoal: '快速从产品文档中找到答案。',
      actors: ['终端用户'],
      pages: [
        {
          id: 'public-runtime',
          name: '问答页',
          purpose: '终端用户提问并查看答案。',
        },
      ],
    },
    runtimeSurface: {
      kind: 'generated-app',
      previewUrl: 'https://preview.example.test/apps/app-public',
    },
    runtimeForm: makeRuntimeForm(),
    createdAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  }
}

function makePublicSubmission(
  overrides: Partial<GeneratedAppPublicSubmission> = {},
): GeneratedAppPublicSubmission {
  return {
    id: 'submission-public',
    appId: 'app-public',
    appSpecVersion: 2,
    status: 'completed',
    anonymousSessionId: 'anon-public',
    input: { question: '工作流有哪几种状态？', tone: 'brief' },
    result: {
      status: 'completed',
      sections: [
        {
          sectionId: 'answer',
          label: '答案',
          format: 'markdown',
          value: '工作流有 **草稿** 和 **已发布** 两种状态。',
        },
        {
          sectionId: 'citations',
          label: '引用',
          format: 'citations',
          value: [
            {
              title: 'core-concepts.md',
              quote: '工作流分为草稿与已发布。',
              source: 'docs/core-concepts.md',
            },
          ],
        },
        {
          sectionId: 'raw',
          label: '原始输出',
          format: 'json',
          value: { confidence: 0.9 },
        },
        { sectionId: 'note', label: '备注', format: 'text', value: null },
      ],
      publicError: null,
    },
    errorMessage: null,
    createdAt: '2026-10-20T02:00:00.000Z',
    updatedAt: '2026-10-20T02:00:05.000Z',
    ...overrides,
  }
}

describe('GeneratedAppPublicRuntimePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicRuntimeQuery.data = makePublicRuntime()
    publicRuntimeQuery.isError = false
    publicRuntimeQuery.isLoading = false
    publicRuntimeQuery.refetch = vi.fn()
    publicSubmissionQuery.data = undefined
    publicSubmissionQuery.isError = false
    publicSubmissionQuery.isFetching = false
    publicSubmissionQuery.isLoading = false
    publicSubmissionQuery.refetch = vi.fn()
    createPublicSubmissionMutation.mutateAsync = vi.fn()
    createPublicSubmissionMutation.data = undefined
    createPublicSubmissionMutation.isPending = false
  })

  it('渲染数据使用说明、公开 AppSpec 摘要与预览链接，不泄露令牌', () => {
    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(useGeneratedAppPublicRuntimeMock).toHaveBeenCalledWith(
      'public-token',
    )
    expect(
      screen.getByText('提交内容与结果会被保存，并提供给应用创建者查看。'),
    ).toBeInTheDocument()
    expect(screen.getByText('输入问题，返回答案与文档引用。')).toBeInTheDocument()
    expect(screen.getByText('快速从产品文档中找到答案。')).toBeInTheDocument()
    expect(screen.getByText('问答页')).toBeInTheDocument()
    expect(screen.getByText('提交后在这里显示答案与引用。')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /打开运行预览/ }),
    ).toHaveAttribute('href', 'https://preview.example.test/apps/app-public')
    expect(
      screen.queryByText('public-token-with-a-very-long-value'),
    ).not.toBeInTheDocument()
  })

  it('按 AppSpec 字段渲染控件，控件或选项容器带 data-field-id，选项带 data-option-value', () => {
    const { container } = render(
      <GeneratedAppPublicRuntimePage token="public-token" />,
    )

    const question = container.querySelector('[data-field-id="question"]')
    expect(question?.tagName).toBe('TEXTAREA')
    expect(question).toHaveAttribute('maxlength', '500')
    expect(screen.getByLabelText(/问题/)).toBe(question)

    const topK = container.querySelector('[data-field-id="topK"]')
    expect(topK).toHaveAttribute('type', 'number')
    expect(topK).toHaveAttribute('min', '1')
    expect(topK).toHaveAttribute('max', '5')

    const tone = container.querySelector('[data-field-id="tone"]')
    expect(tone).toHaveAttribute('role', 'radiogroup')
    expect(
      tone?.querySelector('[data-option-value="brief"]'),
    ).toHaveAttribute('role', 'radio')

    const topics = container.querySelector('[data-field-id="topics"]')
    expect(topics?.tagName).toBe('FIELDSET')
    expect(
      topics?.querySelector('[data-option-value="agent"]'),
    ).toHaveAttribute('role', 'checkbox')

    expect(container.querySelectorAll('form button[type="submit"]')).toHaveLength(1)
    expect(container.querySelector('input[type="range"]')).toBeNull()
  })

  it('校验必填后按字段类型组装提交 JSON，并以返回的提交 id 轮询结果', async () => {
    const user = userEvent.setup()
    const submission = makePublicSubmission({
      status: 'running',
      result: { status: 'running', sections: [], publicError: null },
    })
    createPublicSubmissionMutation.mutateAsync.mockResolvedValue(submission)

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    await user.click(screen.getByRole('button', { name: '提问' }))
    expect(screen.getByText('请先修正标出的字段。')).toBeInTheDocument()
    expect(screen.getByText('请填写问题。')).toBeInTheDocument()
    expect(screen.getByText('请填写回答风格。')).toBeInTheDocument()
    expect(createPublicSubmissionMutation.mutateAsync).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/问题/), '  工作流有哪几种状态？ ')
    await user.type(screen.getByLabelText(/引用条数/), '3')
    await user.click(screen.getByLabelText('详细'))
    await user.click(screen.getByLabelText('工作流'))
    await user.click(screen.getByLabelText('Agent'))
    await user.click(screen.getByRole('button', { name: '提问' }))

    await waitFor(() => {
      expect(createPublicSubmissionMutation.mutateAsync).toHaveBeenCalledWith({
        input: {
          question: '工作流有哪几种状态？',
          topK: 3,
          tone: 'detailed',
          topics: ['workflow', 'agent'],
        },
        clientContext: expect.objectContaining({
          formId: 'docs-qa-form',
          submittedAt: expect.any(String),
        }),
      })
      expect(useGeneratedAppPublicSubmissionMock).toHaveBeenCalledWith(
        'public-token',
        'submission-public',
      )
    })
  })

  it('选填字段留空时不进入提交 JSON', async () => {
    const user = userEvent.setup()
    createPublicSubmissionMutation.mutateAsync.mockResolvedValue(
      makePublicSubmission(),
    )

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    await user.type(screen.getByLabelText(/问题/), '工作流有哪几种状态？')
    await user.click(screen.getByLabelText('简短'))
    await user.click(screen.getByRole('button', { name: '提问' }))

    await waitFor(() => {
      expect(createPublicSubmissionMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { question: '工作流有哪几种状态？', tone: 'brief' },
        }),
      )
    })
  })

  it('执行中的提交显示 data-result-status=running，不渲染结果分区', () => {
    createPublicSubmissionMutation.data = makePublicSubmission({
      status: 'received',
      result: null,
    })

    const { container } = render(
      <GeneratedAppPublicRuntimePage token="public-token" />,
    )

    const result = screen.getByTestId('generated-app-public-submission-result')
    expect(result).toHaveAttribute('data-result-status', 'running')
    expect(result).toHaveAttribute('data-submission-id', 'submission-public')
    expect(screen.getByText('正在处理，结果出来后会自动显示。')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-result-section-id]')).toHaveLength(0)
  })

  it('完成后按 result.sections 渲染 markdown、citations、json、text 分区', () => {
    publicSubmissionQuery.data = makePublicSubmission()

    const { container } = render(
      <GeneratedAppPublicRuntimePage token="public-token" />,
    )

    const result = screen.getByTestId('generated-app-public-submission-result')
    expect(result).toHaveAttribute('data-result-status', 'completed')

    const answer = container.querySelector('[data-result-section-id="answer"]')
    expect(answer).toHaveTextContent('工作流有 草稿 和 已发布 两种状态。')
    expect(answer?.querySelector('strong')).toHaveTextContent('草稿')
    expect(within(result).getByText('答案')).toBeInTheDocument()

    const citations = container.querySelector(
      '[data-result-section-id="citations"]',
    ) as HTMLElement
    expect(within(citations).getByText('core-concepts.md')).toBeInTheDocument()
    expect(
      within(citations).getByText('工作流分为草稿与已发布。'),
    ).toBeInTheDocument()
    expect(within(citations).getByText('docs/core-concepts.md')).toBeInTheDocument()

    const raw = container.querySelector('[data-result-section-id="raw"]')
    expect(raw?.querySelector('pre')).toHaveTextContent('"confidence": 0.9')

    // 缺失输出的分区容器保持为空，说明文字放在容器外，避免浏览器验收把它当成内容
    const note = container.querySelector('[data-result-section-id="note"]')
    expect(note).toBeEmptyDOMElement()
    expect(screen.getByText('没有返回内容。')).toBeInTheDocument()
  })

  it('执行失败时显示公开失败原因并标记 data-result-status=failed', () => {
    publicSubmissionQuery.data = makePublicSubmission({
      status: 'failed',
      result: {
        status: 'failed',
        sections: [],
        publicError: '应用暂时无法处理提交，请稍后再试或联系应用创建者。',
      },
      errorMessage: '应用暂时无法处理提交，请稍后再试或联系应用创建者。',
    })

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(
      screen.getByTestId('generated-app-public-submission-result'),
    ).toHaveAttribute('data-result-status', 'failed')
    expect(
      screen.getByText('应用暂时无法处理提交，请稍后再试或联系应用创建者。'),
    ).toBeInTheDocument()
  })

  it('提交被服务端 422 拒绝时显示 problem detail，并把 errors[] 标到对应字段', async () => {
    const user = userEvent.setup()
    const rejection = new HTTPError(
      new Response(null, { status: 422 }),
      new Request('http://localhost/api/v1/generated-apps/public/t/submissions'),
      {} as never,
    )
    rejection.data = {
      type: 'https://agentloom.dev/errors/generated-app-public-submission-invalid',
      detail: '提交内容未通过该应用的运行时表单契约校验，请修正后重试',
      errors: [
        { field: 'input.tone', message: '不是可选的选项' },
        { field: 'input.unknownField', message: '不是该应用表单声明的字段' },
      ],
    }
    createPublicSubmissionMutation.mutateAsync.mockRejectedValue(rejection)

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    await user.type(screen.getByLabelText(/问题/), '工作流有哪几种状态？')
    await user.click(screen.getByLabelText('简短'))
    await user.click(screen.getByRole('button', { name: '提问' }))

    expect(
      await screen.findByText(
        '提交内容未通过该应用的运行时表单契约校验，请修正后重试',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('不是可选的选项')).toBeInTheDocument()
    expect(screen.queryByText('不是该应用表单声明的字段')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('generated-app-public-submission-result'),
    ).not.toBeInTheDocument()
  })

  it('没有预览地址时显示准备中', () => {
    publicRuntimeQuery.data = makePublicRuntime({
      runtimeSurface: { kind: 'generated-app', previewUrl: null },
    })

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(screen.getByText('运行界面尚在准备中。')).toBeInTheDocument()
  })

  it('公开链接不可用时显示关闭状态并可重试', async () => {
    const user = userEvent.setup()
    publicRuntimeQuery.data = undefined
    publicRuntimeQuery.isError = true

    render(<GeneratedAppPublicRuntimePage token="closed-token" />)

    expect(screen.getByTestId('generated-app-public-runtime-error')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(publicRuntimeQuery.refetch).toHaveBeenCalled()
  })

  it('加载中显示占位', () => {
    publicRuntimeQuery.data = undefined
    publicRuntimeQuery.isLoading = true

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(screen.getByText('正在打开应用…')).toBeInTheDocument()
  })
})
