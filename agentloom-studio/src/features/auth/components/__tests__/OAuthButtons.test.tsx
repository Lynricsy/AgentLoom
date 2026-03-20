import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInWithOAuth = vi.fn();

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { OAuthButtons } from '../OAuthButtons';

describe('OAuthButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('渲染 Google 和 GitHub 按钮', () => {
    render(<OAuthButtons />);

    expect(screen.getByText('使用 Google 继续')).toBeInTheDocument();
    expect(screen.getByText('使用 GitHub 继续')).toBeInTheDocument();
  });

  it('点击 Google 按钮调用 signInWithOAuth', async () => {
    render(<OAuthButtons />);

    fireEvent.click(screen.getByText('使用 Google 继续'));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
        },
      });
    });
  });

  it('点击 GitHub 按钮调用 signInWithOAuth', async () => {
    render(<OAuthButtons />);

    fireEvent.click(screen.getByText('使用 GitHub 继续'));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
        },
      });
    });
  });

  it('disabled 时按钮不可点击', () => {
    render(<OAuthButtons disabled />);

    const googleBtn = screen.getByText('使用 Google 继续').closest('button');
    const githubBtn = screen.getByText('使用 GitHub 继续').closest('button');
    expect(googleBtn).toBeDisabled();
    expect(githubBtn).toBeDisabled();
  });

  it('OAuth 请求中，两个按钮都被禁用', async () => {
    mockSignInWithOAuth.mockReturnValue(new Promise(() => {}));

    render(<OAuthButtons />);
    fireEvent.click(screen.getByText('使用 Google 继续'));

    await waitFor(() => {
      const githubBtn = screen.getByText('使用 GitHub 继续').closest('button');
      expect(githubBtn).toBeDisabled();
    });
  });
});
