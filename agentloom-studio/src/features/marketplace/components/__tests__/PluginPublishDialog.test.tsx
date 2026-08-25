import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { HTTPError, type NormalizedOptions } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginPublishDialog, type PluginPublishTarget } from '../PluginPublishDialog'
import type { MarketplaceReviewResult } from '../../types'

const { submitMock, updateMock } = vi.hoisted(() => ({
  submitMock: { mutateAsync: vi.fn(), isPending: false },
  updateMock: { mutateAsync: vi.fn(), isPending: false },
}))

vi.mock('../../api/marketplaceMutations', () => ({
  useSubmitPluginMarketplaceListing: () => submitMock,
  useUpdatePluginMarketplaceListing: () => updateMock,
}))

const CREATE_TARGET: PluginPublishTarget = {
  mode: 'create',
  pluginDbId: 'plugin-db-1',
  pluginName: '翻译插件',
}

const EDIT_TARGET: PluginPublishTarget = {
  mode: 'edit',
  pluginName: '翻译插件',
  listing: {
    id: 'listing-1',
    title: '高质量机器翻译节点',
    summary:
      '把 DeepL 风格的机器翻译能力接进画布，支持 20 种语言互译并保留术语表。',
    category: 'content',
    tags: ['翻译', 'nlp'],
    pricingModel: 'per_execution',
    pricePerExecution: '0.02',
  },
}

function passedReview(): MarketplaceReviewResult {
  return {
    outcome: 'passed',
    checks: [],
    reviewedAt: '2026-03-15T00:00:00.000Z',
  }
}

function failedReview(): MarketplaceReviewResult {
  return {
    outcome: 'failed',
    checks: [
      {
        code: 'TITLE_INVALID',
        status: 'failed',
        message: '标题不符合规范',
        fixHint: '请把标题写成 5-120 个字符',
        field: 'title',
      },
      {
        code: 'SUMMARY_INVALID',
        status: 'passed',
        message: '简介符合规范',
      },
    ],
    reviewedAt: '2026-03-15T00:00:00.000Z',
  }
}

function makeHttpError(status: number): HTTPError {
  const request = new Request('http://localhost/api/v1/plugins/marketplace/listings')
  const response = new Response(JSON.stringify({ detail: 'conflict' }), { status })

  return new HTTPError(response, request, {} as NormalizedOptions)
}

async function fillValidForm(user: UserEvent) {
  await user.type(
    screen.getByTestId('plugin-listing-title-input'),
    '高质量机器翻译节点',
  )
  await user.type(
    screen.getByTestId('plugin-listing-summary-input'),
    '把机器翻译能力接进画布，支持二十种语言互译并保留术语表，适合内容本地化流程。',
  )
  await user.type(screen.getByTestId('plugin-listing-tags-input'), '翻译')
  await user.keyboard('{Enter}')
}

describe('PluginPublishDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('target 为 null 时不渲染对话框', () => {
    render(<PluginPublishDialog target={null} onOpenChange={vi.fn()} />)

    expect(screen.queryByTestId('plugin-publish-dialog')).not.toBeInTheDocument()
  })

  it('新建模式提交 pluginDbId 与表单值', async () => {
    const user = userEvent.setup()
    submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: passedReview(),
    })

    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    await waitFor(() => {
      expect(submitMock.mutateAsync).toHaveBeenCalledWith({
        pluginDbId: 'plugin-db-1',
        title: '高质量机器翻译节点',
        summary:
          '把机器翻译能力接进画布，支持二十种语言互译并保留术语表，适合内容本地化流程。',
        category: undefined,
        tags: ['翻译'],
        pricingModel: 'free',
        pricePerExecution: undefined,
      })
    })
    expect(screen.getByTestId('plugin-publish-listed')).toBeInTheDocument()
  })

  it('拒绝超过 120 字符的标题且不发请求', async () => {
    const user = userEvent.setup()
    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await user.type(screen.getByTestId('plugin-listing-title-input'), 'a'.repeat(121))
    await user.type(
      screen.getByTestId('plugin-listing-summary-input'),
      '把机器翻译能力接进画布，支持二十种语言互译并保留术语表，适合内容本地化流程。',
    )
    await user.type(screen.getByTestId('plugin-listing-tags-input'), '翻译')
    await user.keyboard('{Enter}')
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(await screen.findByText('标题最多 120 个字符')).toBeInTheDocument()
    expect(submitMock.mutateAsync).not.toHaveBeenCalled()
  })

  it('拒绝少于 5 字符的标题且不发请求', async () => {
    const user = userEvent.setup()
    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await user.type(screen.getByTestId('plugin-listing-title-input'), 'abcd')
    await user.type(
      screen.getByTestId('plugin-listing-summary-input'),
      '把机器翻译能力接进画布，支持二十种语言互译并保留术语表，适合内容本地化流程。',
    )
    await user.type(screen.getByTestId('plugin-listing-tags-input'), '翻译')
    await user.keyboard('{Enter}')
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(await screen.findByText('标题至少 5 个字符')).toBeInTheDocument()
    expect(submitMock.mutateAsync).not.toHaveBeenCalled()
  })

  it('标签为空时报错且不发请求', async () => {
    const user = userEvent.setup()
    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await user.type(
      screen.getByTestId('plugin-listing-title-input'),
      '高质量机器翻译节点',
    )
    await user.type(
      screen.getByTestId('plugin-listing-summary-input'),
      '把机器翻译能力接进画布，支持二十种语言互译并保留术语表，适合内容本地化流程。',
    )
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(await screen.findByText('请至少添加 1 个标签')).toBeInTheDocument()
    expect(submitMock.mutateAsync).not.toHaveBeenCalled()
  })

  it('按次计费必须填合法单价', async () => {
    const user = userEvent.setup()
    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByTestId('plugin-listing-pricing-select'))
    await user.click(await screen.findByRole('option', { name: '按次计费' }))
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(
      await screen.findByText('请输入非负单价，最多 8 位小数'),
    ).toBeInTheDocument()
    expect(submitMock.mutateAsync).not.toHaveBeenCalled()

    await user.type(screen.getByTestId('plugin-listing-price-input'), '0.05')
    submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: passedReview(),
    })
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    await waitFor(() => {
      expect(submitMock.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          pricingModel: 'per_execution',
          pricePerExecution: '0.05',
        }),
      )
    })
  })

  it('review_failed 时只列出未通过项的 message 与 fixHint', async () => {
    const user = userEvent.setup()
    submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: failedReview(),
    })

    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    const panel = await screen.findByTestId('plugin-review-failed')
    expect(within(panel).getByText('标题不符合规范')).toBeInTheDocument()
    expect(
      within(panel).getByText('请把标题写成 5-120 个字符'),
    ).toBeInTheDocument()
    expect(within(panel).queryByText('简介符合规范')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('plugin-review-check-item')).toHaveLength(1)
  })

  it('编辑模式预填现值、提示重新审查并调用 PATCH', async () => {
    const user = userEvent.setup()
    updateMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: passedReview(),
    })

    render(<PluginPublishDialog target={EDIT_TARGET} onOpenChange={vi.fn()} />)

    expect(screen.getByTestId('plugin-listing-title-input')).toHaveValue(
      '高质量机器翻译节点',
    )
    expect(screen.getByTestId('plugin-listing-price-input')).toHaveValue('0.02')
    expect(screen.getByText('翻译')).toBeInTheDocument()
    expect(
      screen.getByText(/保存后服务端会重新审查这条发布/),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    await waitFor(() => {
      expect(updateMock.mutateAsync).toHaveBeenCalledWith({
        listingId: 'listing-1',
        request: {
          title: '高质量机器翻译节点',
          summary:
            '把 DeepL 风格的机器翻译能力接进画布，支持 20 种语言互译并保留术语表。',
          category: 'content',
          tags: ['翻译', 'nlp'],
          pricingModel: 'per_execution',
          pricePerExecution: '0.02',
        },
      })
    })
    expect(submitMock.mutateAsync).not.toHaveBeenCalled()
  })

  it('编辑重审失败时提示已被下架', async () => {
    const user = userEvent.setup()
    updateMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: failedReview(),
    })

    render(<PluginPublishDialog target={EDIT_TARGET} onOpenChange={vi.fn()} />)

    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(
      await screen.findByText('重新审查未通过，该发布已被下架'),
    ).toBeInTheDocument()
  })

  it('409 时提示已有发布记录', async () => {
    const user = userEvent.setup()
    submitMock.mutateAsync.mockRejectedValue(makeHttpError(409))

    render(<PluginPublishDialog target={CREATE_TARGET} onOpenChange={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByTestId('plugin-listing-submit-btn'))

    expect(await screen.findByText('已存在发布记录')).toBeInTheDocument()
  })
})
