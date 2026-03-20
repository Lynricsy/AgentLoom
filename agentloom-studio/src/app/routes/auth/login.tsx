import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { OAuthButtons } from '@/features/auth/components/OAuthButtons';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { supabase } from '@/shared/lib/supabase';
import { Input } from '@/shared/ui/input';
import { rootRoute } from '../__root';

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      // MFA challenge detection: Supabase returns factors in the session
      // when MFA is enabled but not yet verified
      if (
        result.session === null &&
        result.user &&
        'factors' in result.user &&
        Array.isArray(result.user.factors) &&
        result.user.factors.length > 0
      ) {
        setServerError('此账号启用了多因素认证 (MFA)，暂不支持 MFA 验证，请联系管理员');
        return;
      }

      const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        navigate({ to: '/' });
      }
    } catch {
      setServerError('登录过程中发生未知错误，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">登录</h1>
          <p className="mt-1 text-sm text-muted">
            登录您的 AgentLoom 账号
          </p>
        </div>

        <OAuthButtons disabled={isSubmitting} />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">或</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {serverError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-xs font-medium text-foreground">邮箱</label>
            <Input
              id="login-email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-error">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-medium text-foreground">密码</label>
            <PasswordInput
              id="login-password"
              placeholder="输入密码"
              autoComplete="current-password"
              error={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-error">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          还没有账号？{' '}
          <Link to="/register" className="text-primary hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});
