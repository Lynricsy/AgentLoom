import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedAppPublicRuntime } from '../../types'

const { publicRuntimeQuery, useGeneratedAppPublicRuntimeMock } = vi.hoisted(
  () => ({
    publicRuntimeQuery: {
      data: undefined as unknown,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    },
    useGeneratedAppPublicRuntimeMock: vi.fn(),
  }),
)

vi.mock('../../api', () => ({
  useGeneratedAppPublicRuntime: (token: string | undefined) => {
    useGeneratedAppPublicRuntimeMock(token)
    return publicRuntimeQuery
  },
}))

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
    createdAt: '2026-04-25T00:00:00.000Z',
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
    expect(screen.getByText('终端用户')).toBeInTheDocument()
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
