import { render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseIsAuthenticated = vi.hoisted(() => vi.fn(() => false));
const mockUseAuthLoading = vi.hoisted(() => vi.fn(() => false));
const mockUseAuthToken = vi.hoisted(() => vi.fn<() => string | undefined>());
const mockUseNotificationSocket = vi.hoisted(() => vi.fn());
const mockAuthState = vi.hoisted(() => ({ needsOnboarding: false }));
const mockUseAuthStore = vi.hoisted(() =>
  vi.fn(
    (selector: (state: typeof mockAuthState) => unknown) =>
      selector(mockAuthState),
  ),
);

vi.mock('@/features/auth', () => ({
  useIsAuthenticated: mockUseIsAuthenticated,
  useAuthLoading: mockUseAuthLoading,
  useAuthStore: mockUseAuthStore,
  useAccessToken: vi.fn(),
  useAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
}));

vi.mock('@/features/execution', () => ({
  useAuthToken: mockUseAuthToken,
}));

vi.mock('@/features/notification', () => ({
  useNotificationSocket: mockUseNotificationSocket,
  NotificationBell: () => <div data-testid="notification-bell" />,
  NotificationPreferencesPage: () => <div data-testid="notification-preferences-page" />,
  NotificationCenterPage: () => <div data-testid="notification-center-page" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  createRootRoute: vi.fn().mockReturnValue({ options: {}, addChildren: vi.fn() }),
  createRoute: vi.fn().mockReturnValue({}),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useRouterState: vi.fn().mockReturnValue({ pathname: '/' }),
  // RootLayout 现在挂载 CommandPalette，后者依赖 useNavigate
  useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('@tanstack/router-devtools', () => ({
  TanStackRouterDevtools: () => null,
}));

vi.mock('../index', () => ({ indexRoute: {} }));
vi.mock('../workflows/$workflowId', () => ({ workflowCanvasRoute: {} }));
vi.mock('../resources/knowledge-bases.$knowledgeBaseId', () => ({ resourceKnowledgeBaseDetailRoute: {} }));
vi.mock('../executions/$executionId', () => ({ executionDebugRoute: {} }));
vi.mock('../executions/$executionId.steps.$stepId.agent', () => ({ executionAgentViewerRoute: {} }));
vi.mock('../settings/tool-library', () => ({ toolLibraryRoute: {} }));
vi.mock('../settings/audit-logs', () => ({ auditLogsRoute: {} }));
vi.mock('../templates', () => ({ templatesRoute: {} }));
vi.mock('../generated-apps.public.$token', () => ({
  generatedAppPublicRuntimeRoute: {},
}));
vi.mock('../marketplace', () => ({ marketplaceRoute: {} }));
vi.mock('../marketplace.my-listings', () => ({ marketplaceMyListingsRoute: {} }));
vi.mock('../share.$token', () => ({ shareTokenRoute: {} }));
vi.mock('../settings/encryption', () => ({ encryptionSettingsRoute: {} }));
vi.mock('../developer-console/earnings', () => ({ developerEarningsRoute: {} }));
vi.mock('../settings/security/autonomy-policy', () => ({ organizationAutonomyPolicyRoute: {} }));
vi.mock('../settings/resource-quotas', () => ({ resourceGovernanceRoute: {} }));
vi.mock('../settings/monitoring', () => ({ monitoringRoute: {} }));
vi.mock('../settings/private-deployment', () => ({ privateDeploymentRoute: {} }));
vi.mock('../settings/security', () => ({ securitySettingsRoute: {} }));
vi.mock('../auth/callback', () => ({ authCallbackRoute: {} }));
vi.mock('../auth/login', () => ({ loginRoute: {} }));
vi.mock('../auth/register', () => ({ registerRoute: {} }));

import { RootLayout } from '../__root';

describe('RootLayout auth guard', () => {
  const originalLocation = window.location;
  const originalMatchMedia = window.matchMedia;

  /**
   * 壳层按视口二选一挂载（AppSidebar 或 MobileTopBar），jsdom 没有 matchMedia，
   * 因此每个用例都要显式声明视口；默认桌面态，保持既有布局断言的语义。
   */
  function setViewport(isDesktop: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: isDesktop,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.needsOnboarding = false;
    mockUseAuthToken.mockReturnValue(undefined);
    setViewport(true);
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/', search: '', href: '' },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('로딩 상태일 때 spinner를 렌더링함', () => {
    mockUseAuthLoading.mockReturnValue(true);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('未認証でprotectedルートの場合loginへリダイレクト', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(window.location.href).toBe('/login?returnUrl=%2Fworkflows%2Fdraft');
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('未認証でも/loginはアクセス可能', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/login';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(window.location.href).not.toContain('/login?returnUrl');
  });

  it('未認証でも/registerはアクセス可能', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/register';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('未認証でも/auth/callbackはアクセス可能', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/auth/callback';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('未認証でも/s/:tokenの共有リンクはアクセス可能', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/s/abc123token';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(window.location.href).not.toContain('/login');
  });

  it('未认证也可以访问/generated-apps/public/:token公开应用且不渲染壳层', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    mockUseAuthToken.mockReturnValue('existing-auth-token');
    window.location.pathname = '/generated-apps/public/abc123token';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByText('工作流')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument();
    expect(window.location.href).not.toContain('/login');
    expect(mockUseNotificationSocket).toHaveBeenCalledWith({
      authToken: undefined,
    });
  });

  it('未认证访问仅同/login前缀的私有路由时不会被当作公开路由', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/login-required-private';

    render(<RootLayout />);

    expect(window.location.href).toBe(
      '/login?returnUrl=%2Flogin-required-private',
    );
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });
  it('无租户的认证用户仍会被送进 onboarding', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    mockAuthState.needsOnboarding = true;
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(window.location.href).toBe('/onboarding');
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('已完成用户停留在 onboarding 时由向导决定何时离开', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    mockAuthState.needsOnboarding = false;
    window.location.pathname = '/onboarding';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(window.location.href).toBe('');
  });


  it('認証済みユーザーはnavバー付きのフルレイアウトを取得', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.getByText('工作流')).toBeInTheDocument();
  });

  it('publicルートではnavバーなしでOutletを表示', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/login';

    render(<RootLayout />);

    expect(screen.queryByText('工作流')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('useNotificationSocketに正しいauthTokenを渡す', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    mockUseAuthToken.mockReturnValue('test-token-123');
    window.location.pathname = '/templates';

    render(<RootLayout />);

    expect(mockUseNotificationSocket).toHaveBeenCalledWith({ authToken: 'test-token-123' });
  });

  it('isLoading=trueでもpublicルートはspinnerなしでOutletを表示', () => {
    mockUseAuthLoading.mockReturnValue(true);
    mockUseIsAuthenticated.mockReturnValue(false);
    window.location.pathname = '/login';

    render(<RootLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('桌面视口只挂载侧边栏，通知铃有且仅有一个', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    setViewport(true);
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(screen.queryAllByTestId('notification-bell')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '收起侧边栏' })).toBeInTheDocument();
    expect(screen.queryByLabelText('打开导航')).not.toBeInTheDocument();
  });

  it('移动视口只挂载顶部条，通知铃有且仅有一个', () => {
    mockUseAuthLoading.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);
    setViewport(false);
    window.location.pathname = '/workflows/draft';

    render(<RootLayout />);

    expect(screen.queryAllByTestId('notification-bell')).toHaveLength(1);
    expect(screen.getByLabelText('打开导航')).toBeInTheDocument();
    // 侧边栏整体不在树上，导航文字只存在于抽屉里（默认收起）
    expect(screen.queryByText('工作流')).not.toBeInTheDocument();
  });
});
