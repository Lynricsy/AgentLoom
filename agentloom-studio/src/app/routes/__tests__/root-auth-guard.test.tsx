import { render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseIsAuthenticated = vi.hoisted(() => vi.fn(() => false));
const mockUseAuthLoading = vi.hoisted(() => vi.fn(() => false));
const mockUseAuthToken = vi.hoisted(() => vi.fn<() => string | undefined>());
const mockUseNotificationSocket = vi.hoisted(() => vi.fn());

vi.mock('@/features/auth', () => ({
  useIsAuthenticated: mockUseIsAuthenticated,
  useAuthLoading: mockUseAuthLoading,
  useAuthStore: vi.fn(),
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
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  createRootRoute: vi.fn().mockReturnValue({ options: {}, addChildren: vi.fn() }),
  createRoute: vi.fn().mockReturnValue({}),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useRouterState: vi.fn().mockReturnValue({ pathname: '/' }),
}));

vi.mock('@tanstack/router-devtools', () => ({
  TanStackRouterDevtools: () => null,
}));

vi.mock('../index', () => ({ indexRoute: {} }));
vi.mock('../workflows/$workflowId', () => ({ workflowCanvasRoute: {} }));
vi.mock('../resources/knowledge-bases.$knowledgeBaseId', () => ({ resourceKnowledgeBaseDetailRoute: {} }));
vi.mock('../executions/$executionId', () => ({ executionDebugRoute: {} }));
vi.mock('../settings/tool-library', () => ({ toolLibraryRoute: {} }));
vi.mock('../settings/audit-logs', () => ({ auditLogsRoute: {} }));
vi.mock('../templates', () => ({ templatesRoute: {} }));
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

  beforeEach(() => {
    vi.clearAllMocks();
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
});
