import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createRootRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router'
import { Workflow } from 'lucide-react'
import { PageHeader } from './PageHeader'
import { EmptyState } from '../empty-state/EmptyState'
import { Spinner } from '../spinner/Spinner'

function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // 路由树仅用于给 <Link> 提供上下文，类型与运行时行为无关
  return render(<RouterProvider router={router as never} />)
}

describe('PageHeader', () => {
  it('渲染标题、描述与操作区', async () => {
    renderInRouter(
      <PageHeader
        title="工作流"
        description="编排你的 DAG"
        icon={Workflow}
        actions={<button type="button">新建</button>}
      />,
    )

    expect(await screen.findByRole('heading', { name: '工作流' })).toBeInTheDocument()
    expect(screen.getByText('编排你的 DAG')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument()
  })

  it('面包屑最后一项为纯文本，其余为链接', async () => {
    renderInRouter(
      <PageHeader
        title="详情"
        breadcrumb={[{ label: '资源', to: '/' }, { label: '详情' }]}
      />,
    )

    expect(await screen.findByRole('link', { name: '资源' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '详情' })).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('渲染标题、描述与操作', () => {
    render(
      <EmptyState
        icon={Workflow}
        title="还没有工作流"
        description="创建第一个工作流开始编排"
        action={<button type="button">创建</button>}
      />,
    )

    expect(screen.getByText('还没有工作流')).toBeInTheDocument()
    expect(screen.getByText('创建第一个工作流开始编排')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeInTheDocument()
  })
})

describe('Spinner', () => {
  it('暴露 status 角色与无障碍标签', () => {
    render(<Spinner label="正在加载工作流" />)
    expect(screen.getByRole('status', { name: '正在加载工作流' })).toBeInTheDocument()
  })
})
