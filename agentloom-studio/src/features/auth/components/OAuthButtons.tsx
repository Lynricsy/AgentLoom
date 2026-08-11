import { useState } from 'react';

import { Spinner } from '@/shared/components/spinner/Spinner';
import { supabase } from '@/shared/lib/supabase';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

interface OAuthButtonsProps {
  className?: string;
  disabled?: boolean;
}

export function OAuthButtons({ className, disabled }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleOAuth = async (provider: 'google' | 'github') => {
    try {
      setLoadingProvider(provider);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        console.error(`OAuth ${provider} 登录失败:`, error.message);
      }
    } catch (err) {
      console.error(`OAuth ${provider} 异常:`, err);
    } finally {
      setLoadingProvider(null);
    }
  };

  const isDisabled = disabled || loadingProvider !== null;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <Button
        variant="outline"
        size="lg"
        disabled={isDisabled}
        onClick={() => handleOAuth('google')}
        className="w-full gap-2.5"
      >
        {loadingProvider === 'google' ? <Spinner /> : <GoogleIcon />}
        使用 Google 继续
      </Button>

      <Button
        variant="outline"
        size="lg"
        disabled={isDisabled}
        onClick={() => handleOAuth('github')}
        className="w-full gap-2.5"
      >
        {loadingProvider === 'github' ? <Spinner /> : <GitHubIcon />}
        使用 GitHub 继续
      </Button>
    </div>
  );
}

/** Google 官方彩色标识，配色属于品牌资产，不走主题令牌 */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" role="img" aria-label="Google">
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0012 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 01-.34-2.11c0-.73.13-1.44.34-2.11V7.05H2.18A10.99 10.99 0 001 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
      role="img"
      aria-label="GitHub"
    >
      <title>GitHub</title>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.286-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
