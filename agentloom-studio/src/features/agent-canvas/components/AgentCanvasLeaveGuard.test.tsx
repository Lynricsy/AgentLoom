import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentCanvasStore } from '../stores/agent-canvas.store';
import { AgentCanvasLeaveGuard } from './AgentCanvasLeaveGuard';

function renderGuard(
  onSave: () => Promise<boolean>,
  onPendingChange: (pending: boolean) => void = vi.fn(),
) {
  const rootRoute = createRootRoute();
  const canvasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/agents/a-1',
    component: () => (
      <>
        <AgentCanvasLeaveGuard
          onSave={onSave}
          onPendingChange={onPendingChange}
        />
        <Link to="/agents">返回列表</Link>
      </>
    ),
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/agents',
    component: () => <p>Agent 列表</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([canvasRoute, listRoute]),
    history: createMemoryHistory({ initialEntries: ['/agents/a-1'] }),
  });
  render(<RouterProvider router={router as never} />);
  return router;
}

describe('AgentCanvasLeaveGuard', () => {
  beforeEach(() => {
    useAgentCanvasStore.getState().actions.reset();
  });

  it('没有未保存修改时直接离开', async () => {
    renderGuard(vi.fn());

    fireEvent.click(await screen.findByText('返回列表'));

    expect(await screen.findByText('Agent 列表')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-canvas-leave-dialog')).toBeNull();
  });

  it('有未保存修改时拦截离开，可留下或保存后离开', async () => {
    useAgentCanvasStore.setState({ isDirty: true });
    const onSave = vi.fn(async () => {
      useAgentCanvasStore.setState({ isDirty: false });
      return true;
    });
    const onPendingChange = vi.fn();
    renderGuard(onSave, onPendingChange);

    fireEvent.click(await screen.findByText('返回列表'));
    expect(
      await screen.findByTestId('agent-canvas-leave-dialog'),
    ).toBeInTheDocument();
    // 确认框打开期间通知调用方暂停自动保存，关闭后恢复
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '留在此页' }));
    await waitFor(() =>
      expect(screen.queryByTestId('agent-canvas-leave-dialog')).toBeNull(),
    );
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Agent 列表')).toBeNull();

    fireEvent.click(screen.getByText('返回列表'));
    fireEvent.click(await screen.findByRole('button', { name: '保存并离开' }));

    expect(await screen.findByText('Agent 列表')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('保存失败时留在画布', async () => {
    useAgentCanvasStore.setState({ isDirty: true });
    renderGuard(vi.fn(async () => false));

    fireEvent.click(await screen.findByText('返回列表'));
    fireEvent.click(await screen.findByRole('button', { name: '保存并离开' }));

    await waitFor(() =>
      expect(screen.queryByTestId('agent-canvas-leave-dialog')).toBeNull(),
    );
    expect(screen.getByText('返回列表')).toBeInTheDocument();
    expect(screen.queryByText('Agent 列表')).toBeNull();
  });
});
