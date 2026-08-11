import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createRootRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router'
import { SettingsLayout } from './SettingsLayout'

function renderAt(pathname: string) {
  const rootRoute = createRootRoute({ component: () => <SettingsLayout /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  // 路由树仅用于提供 location 与 <Link> 上下文，类型与运行时行为无关
  return render(<RouterProvider router={router as never} />)
}

/** 当前高亮项的文案；导航项以 aria-current="page" 标记 */
async function currentLabels() {
  await screen.findByText('设置')
  return screen
    .getAllByRole('link')
    .filter((el) => el.getAttribute('aria-current') === 'page')
    .map((el) => el.textContent)
}

describe('SettingsLayout', () => {
  it('渲染全部设置导航项与返回入口', async () => {
    renderAt('/settings')

    for (const label of [
      '概览',
      '个人偏好',
      '安全设置',
      '加密',
      '自治策略',
      '监控',
      '资源配额',
      '私有部署',
      '审计日志',
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument()
    }
    expect(screen.getByLabelText('返回工作台')).toHaveAttribute('href', '/')
  })

  it('个人偏好指向 /settings/preferences', async () => {
    renderAt('/settings')
    expect(await screen.findByRole('link', { name: '个人偏好' })).toHaveAttribute(
      'href',
      '/settings/preferences',
    )
  })

  // 设置页新增时必须同步补导航入口：此断言是「个人偏好」曾长期缺失的回归闸门
  it('导航项数量与设置页总数一致（9 项）', async () => {
    renderAt('/settings')
    await screen.findByText('设置')
    const navLinks = screen.getAllByRole('link').filter((el) => {
      const href = el.getAttribute('href')
      return href !== null && href.startsWith('/settings')
    })
    expect(navLinks).toHaveLength(9)
  })

  it('个人偏好路径下仅个人偏好高亮', async () => {
    renderAt('/settings/preferences')
    expect(await currentLabels()).toEqual(['个人偏好'])
  })

  it('概览仅在精确匹配 /settings 时高亮', async () => {
    renderAt('/settings')
    expect(await currentLabels()).toEqual(['概览'])
  })

  it('子路由下概览不再高亮', async () => {
    renderAt('/settings/monitoring')
    expect(await currentLabels()).toEqual(['监控'])
  })

  it('自治策略不会连带高亮安全设置', async () => {
    renderAt('/settings/security/autonomy-policy')
    expect(await currentLabels()).toEqual(['自治策略'])
  })

  it('安全设置在自身路径下高亮', async () => {
    renderAt('/settings/security')
    expect(await currentLabels()).toEqual(['安全设置'])
  })
})
