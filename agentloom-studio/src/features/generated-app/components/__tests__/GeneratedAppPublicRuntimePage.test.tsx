import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GeneratedAppPublicRuntime,
  GeneratedAppPublicSubmission,
  GeneratedAppRuntimeForm,
} from '../../types'

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
    formId: 'consultation-runtime-form',
    title: '问诊采集表',
    description: '请填写问诊采集信息，提交后查看结构化摘要。',
    submitLabel: '提交问诊信息',
    sections: [
      {
        id: 'consultation-basic',
        title: '问诊信息',
        description: '采集主诉、症状、严重程度和联系偏好。',
        fieldIds: [
          'chiefComplaint',
          'symptoms',
          'severity',
          'contactMode',
          'additionalNotes',
        ],
      },
    ],
    fields: [
      {
        id: 'chiefComplaint',
        label: '主诉',
        type: 'text',
        required: true,
        placeholder: '例如：反复头痛',
        helpText: '请描述当前最主要的不适。',
        options: [],
      },
      {
        id: 'symptoms',
        label: '症状或感受',
        type: 'multi_select',
        required: true,
        placeholder: '',
        helpText: '可多选。',
        options: [
          { value: 'pain', label: '疼痛' },
          { value: 'fever', label: '发热' },
        ],
      },
      {
        id: 'severity',
        label: '严重程度',
        type: 'range',
        required: true,
        placeholder: '',
        helpText: '1 表示轻微，10 表示非常严重。',
        options: [],
        min: 1,
        max: 10,
        step: 1,
      },
      {
        id: 'contactMode',
        label: '联系偏好',
        type: 'single_select',
        required: true,
        placeholder: '',
        helpText: '选择后续沟通方式。',
        options: [
          { value: 'online', label: '线上沟通' },
          { value: 'offline', label: '线下沟通' },
        ],
      },
      {
        id: 'additionalNotes',
        label: '补充说明',
        type: 'textarea',
        required: false,
        placeholder: '可补充其他观察信息',
        helpText: '仅用于整理提交摘要。',
        options: [],
      },
    ],
    resultView: {
      title: '问诊信息报告',
      description: '提交后展示问诊摘要、下一步问题和边界说明。',
      emptyState: '提交后会在这里显示结构化报告。',
      successTitle: '已生成问诊摘要',
      nextStepHint: '如有急重症或持续不适，请及时线下就医。',
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
    title: '自动化中医问诊系统',
    description: '围绕问诊、报告和公开提交生成的终端用户应用。',
    dataUseNotice:
      '提交内容、运行结果和最终报告会被保存，并提供给应用创建者查看。',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '根据患者回答逐步提问，并生成结构化分析报告。',
      userGoal: '让终端用户完成问诊并查看分析报告。',
      actors: ['终端用户', '应用创建者'],
      pages: [
        {
          id: 'page-public-runtime',
          name: '问诊运行页',
          purpose: '终端用户回答问诊问题并查看报告。',
        },
      ],
    },
    runtimeSurface: {
      kind: 'generated-app',
      previewUrl: 'https://preview.example.test/apps/app-public',
    },
    runtimeForm: makeRuntimeForm(),
    createdAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  }
}

function makePublicSubmission(
  overrides: Partial<GeneratedAppPublicSubmission> = {},
): GeneratedAppPublicSubmission {
  return {
    id: 'submission-public',
    appId: 'app-public',
    appSpecVersion: 1,
    status: 'completed',
    anonymousSessionId: 'anon-public',
    input: { chiefComplaint: '我最近头痛', symptoms: ['pain'] },
    result: {
      summary: '已整理问诊信息。',
      nextStepQuestions: ['是否伴随发热或持续加重？'],
      followUpPrompts: ['请补充持续时间。'],
    },
    report: {
      title: '已生成问诊摘要',
      summary: '系统已整理主诉、症状和严重程度。',
      sections: [
        {
          id: 'submitted-information',
          title: '提交内容摘要',
          body: '主诉：我最近头痛',
          items: ['chiefComplaint: 我最近头痛', 'symptoms: 疼痛'],
        },
      ],
      nextStepQuestions: ['主要不适从什么时候开始？'],
      followUpPrompts: ['请补充既往处理。'],
      disclaimers: ['不提供诊断结论、处方或治疗建议。'],
      runtimeNotice: '这是本地 deterministic runtime report。',
    },
    errorMessage: null,
    createdAt: '2026-04-25T02:00:00.000Z',
    updatedAt: '2026-04-25T02:05:00.000Z',
    ...overrides,
  }
}

const { GeneratedAppPublicRuntimePage } =
  await import('../GeneratedAppPublicRuntimePage')

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

  it('renders data use notice, limited AppSpec, and preview link', () => {
    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(useGeneratedAppPublicRuntimeMock).toHaveBeenCalledWith(
      'public-token',
    )
    expect(screen.getByText('自动化中医问诊系统')).toBeInTheDocument()
    expect(
      screen.getByText(
        '提交内容、运行结果和最终报告会被保存，并提供给应用创建者查看。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('根据患者回答逐步提问，并生成结构化分析报告。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('让终端用户完成问诊并查看分析报告。'),
    ).toBeInTheDocument()
    expect(screen.getByText('问诊采集表')).toBeInTheDocument()
    expect(screen.getByLabelText(/主诉/)).toBeInTheDocument()
    expect(screen.getByLabelText('疼痛')).toBeInTheDocument()
    expect(screen.getByLabelText(/严重程度/)).toBeInTheDocument()
    expect(screen.getByText('问诊运行页')).toBeInTheDocument()
    expect(
      screen.getByText('终端用户回答问诊问题并查看报告。'),
    ).toBeInTheDocument()

    const previewLink = screen.getByRole('link', { name: /打开运行预览/ })
    expect(previewLink).toHaveAttribute(
      'href',
      'https://preview.example.test/apps/app-public',
    )

    expect(screen.queryByText(/Gate/)).not.toBeInTheDocument()
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/源码/)).not.toBeInTheDocument()
    expect(screen.queryByText(/测试报告/)).not.toBeInTheDocument()
    expect(screen.queryByText(/插件/)).not.toBeInTheDocument()
    expect(screen.queryByText(/访问标识/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('public-token-with-a-very-long-value'),
    ).not.toBeInTheDocument()
  })

  it('renders a preparation message when preview URL is not available', () => {
    publicRuntimeQuery.data = makePublicRuntime({
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: null,
      },
    })

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(screen.getByText('运行界面尚在准备中。')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /打开运行预览/ }),
    ).not.toBeInTheDocument()
  })

  it('renders dynamic form, validates required fields, submits payload, and renders structured report', async () => {
    const user = userEvent.setup()
    const publicSubmission = {
      ...makePublicSubmission(),
      tenantId: 'tenant-private',
      publicShareToken: 'public-token',
      gateResults: [{ gateId: 'gate-0' }],
      sourceArtifactUrl: 'https://internal.example.test/source.zip',
      testReportUrl: 'https://internal.example.test/report.json',
      pluginIds: ['plugin-private'],
    } as unknown as GeneratedAppPublicSubmission
    createPublicSubmissionMutation.mutateAsync.mockImplementation(async () => {
      publicSubmissionQuery.data = publicSubmission
      return publicSubmission
    })

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    await user.click(screen.getByRole('button', { name: '提交问诊信息' }))

    expect(screen.getByText('请先补齐必填字段。')).toBeInTheDocument()
    expect(createPublicSubmissionMutation.mutateAsync).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/主诉/), '我最近头痛')
    await user.click(screen.getByLabelText('疼痛'))
    fireEvent.change(screen.getByLabelText(/严重程度/), {
      target: { value: '7' },
    })
    await user.selectOptions(screen.getByLabelText(/联系偏好/), 'online')
    await user.type(screen.getByLabelText(/补充说明/), '夜间加重')
    await user.click(screen.getByRole('button', { name: '提交问诊信息' }))

    await waitFor(() => {
      expect(createPublicSubmissionMutation.mutateAsync).toHaveBeenCalledWith({
        input: {
          chiefComplaint: '我最近头痛',
          symptoms: ['pain'],
          severity: 7,
          contactMode: 'online',
          additionalNotes: '夜间加重',
        },
        clientContext: expect.objectContaining({
          formId: 'consultation-runtime-form',
          submittedAt: expect.any(String),
        }),
      })
      expect(useGeneratedAppPublicSubmissionMock).toHaveBeenCalledWith(
        'public-token',
        'submission-public',
      )
    })

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('已生成问诊摘要')).toBeInTheDocument()
    expect(screen.getByText('提交内容摘要')).toBeInTheDocument()
    expect(screen.getAllByText(/我最近头痛/).length).toBeGreaterThan(0)
    expect(screen.getByText('主要不适从什么时候开始？')).toBeInTheDocument()
    expect(screen.getByText('请补充既往处理。')).toBeInTheDocument()
    expect(
      screen.getByText('不提供诊断结论、处方或治疗建议。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('这是本地 deterministic runtime report。'),
    ).toBeInTheDocument()

    expect(screen.queryByText(/public-token/)).not.toBeInTheDocument()
    expect(screen.queryByText(/publicShareToken/)).not.toBeInTheDocument()
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/gateResults/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sourceArtifactUrl/)).not.toBeInTheDocument()
    expect(screen.queryByText(/testReportUrl/)).not.toBeInTheDocument()
    expect(screen.queryByText(/pluginIds/)).not.toBeInTheDocument()
    expect(screen.queryByText(/runtimeKind/)).not.toBeInTheDocument()
  })

  it.each([
    ['pending', '等待执行', 'Workflow 正在排队，页面会自动刷新执行状态。'],
    ['running', '正在执行', 'Workflow 正在执行，页面会自动刷新执行状态。'],
    [
      'paused',
      '已暂停',
      'Workflow 已暂停，页面会继续刷新执行状态，并保留本地报告。',
    ],
    ['completed', '已完成', 'Workflow 执行已完成，当前仅展示安全摘要。'],
    ['failed', '执行未完成', 'Workflow 执行未完成，页面继续保留本地报告。'],
    ['cancelled', '已取消', 'Workflow 已取消，页面继续保留本地报告。'],
  ] as const)(
    'renders safe async workflow handoff UI for %s status',
    (executionStatus, label, message) => {
      createPublicSubmissionMutation.data = makePublicSubmission({
        status:
          executionStatus === 'pending'
            ? 'received'
            : executionStatus === 'running' || executionStatus === 'paused'
              ? 'running'
              : executionStatus === 'completed'
                ? 'completed'
                : 'failed',
        result: {
          summary: '已整理问诊信息。',
          workflowExecution: true,
          executionId: '55555555-5555-4555-8555-555555555557',
          executionStatus,
          workflowDefinitionId: '55555555-5555-4555-8555-555555555556',
          executionBoundary:
            executionStatus === 'completed'
              ? 'async-workflow-execution-completed'
              : executionStatus === 'failed'
                ? 'async-workflow-execution-failed'
                : executionStatus === 'cancelled'
                  ? 'async-workflow-execution-cancelled'
                  : 'async-workflow-execution-created',
          workflowExecutionNotice:
            executionStatus === 'completed'
              ? 'Workflow execution 已完成；公开页面仅展示安全执行摘要。'
              : 'Workflow execution 状态已刷新。',
          workflowExecutionSummary:
            executionStatus === 'completed'
              ? {
                  summary: 'Workflow execution 已完成。',
                  completedSteps: 2,
                  totalSteps: 2,
                  failedSteps: 0,
                  cancelledSteps: 0,
                }
              : null,
          definitionSnapshot: { token: 'secret-token-value' },
          checkpointData: { stack: 'internal stack' },
          nodeData: { path: '/root/AgentLoom/.env' },
          toolCalls: [{ token: 'secret-token-value' }],
        },
        report: {
          title: '已生成问诊摘要',
          summary: '系统已整理主诉、症状和严重程度。',
          sections: [
            {
              id: 'submitted-information',
              title: '提交内容摘要',
              body: '主诉：我最近头痛',
              items: ['chiefComplaint: 我最近头痛'],
            },
          ],
          workflowExecution: true,
          executionId: '55555555-5555-4555-8555-555555555557',
          executionStatus,
          workflowDefinitionId: '55555555-5555-4555-8555-555555555556',
          workflowExecutionNotice: 'Workflow execution 状态已刷新。',
        },
      })

      render(<GeneratedAppPublicRuntimePage token="public-token" />)

      const panel = screen.getByTestId('workflow-execution-status')
      expect(panel).toHaveAttribute('data-execution-status', executionStatus)
      expect(within(panel).getByText(label)).toBeInTheDocument()
      expect(within(panel).getByText(message)).toBeInTheDocument()

      if (executionStatus === 'completed') {
        expect(within(panel).getByText('完成步骤：2')).toBeInTheDocument()
        expect(within(panel).getByText('总步骤：2')).toBeInTheDocument()
      }

      expect(screen.queryByText(/55555555-5555/)).not.toBeInTheDocument()
      expect(screen.queryByText(/definitionSnapshot/)).not.toBeInTheDocument()
      expect(screen.queryByText(/checkpointData/)).not.toBeInTheDocument()
      expect(screen.queryByText(/nodeData/)).not.toBeInTheDocument()
      expect(screen.queryByText(/toolCalls/)).not.toBeInTheDocument()
      expect(screen.queryByText(/secret-token-value/)).not.toBeInTheDocument()
      expect(screen.queryByText(/internal stack/)).not.toBeInTheDocument()
      expect(screen.queryByText('/root/AgentLoom')).not.toBeInTheDocument()
    },
  )

  it('renders failed public submissions as a safe failure state instead of a success report', () => {
    createPublicSubmissionMutation.data = makePublicSubmission({
      status: 'failed',
      result: null,
      report: null,
      errorMessage:
        '提交内容包含当前本地 Generated App runtime 无法处理的结构，已保存失败状态，请调整输入后重新提交。',
    })

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('提交未能生成报告')).toBeInTheDocument()
    expect(
      screen.getByText(
        '提交内容已保存为失败状态，但当前公开运行页无法安全处理该输入结构。请调整输入后重新提交。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /提交内容包含当前本地 Generated App runtime 无法处理的结构/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('已生成问诊摘要')).not.toBeInTheDocument()
  })

  it('renders an inaccessible or closed state when public runtime lookup fails', async () => {
    const user = userEvent.setup()
    publicRuntimeQuery.data = undefined
    publicRuntimeQuery.isError = true

    render(<GeneratedAppPublicRuntimePage token="closed-token" />)

    expect(screen.getByText('公开应用不可访问或已关闭')).toBeInTheDocument()
    expect(
      screen.getByText(
        '这个链接不存在、已被创建者关闭，或应用当前不满足公开访问条件。',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(publicRuntimeQuery.refetch).toHaveBeenCalled()
  })

  it('renders a loading state', () => {
    publicRuntimeQuery.data = undefined
    publicRuntimeQuery.isLoading = true

    render(<GeneratedAppPublicRuntimePage token="public-token" />)

    expect(screen.getByText('正在打开应用…')).toBeInTheDocument()
  })
})
