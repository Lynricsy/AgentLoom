import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, createRoute, useNavigate } from '@tanstack/react-router';
import { HTTPError } from 'ky';
import { z } from 'zod';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { apiClient } from '@/shared/api/client';
import { supabase } from '@/shared/lib/supabase';
import { Input } from '@/shared/ui/input';
import { rootRoute } from '../__root';

const PASSWORD_REGEX_UPPERCASE = /[A-Z]/;
const PASSWORD_REGEX_LOWERCASE = /[a-z]/;
const PASSWORD_REGEX_NUMBER = /[0-9]/;

const registerSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z
      .string()
      .min(8, '密码至少 8 个字符')
      .regex(PASSWORD_REGEX_UPPERCASE, '密码需包含至少一个大写字母')
      .regex(PASSWORD_REGEX_LOWERCASE, '密码需包含至少一个小写字母')
      .regex(PASSWORD_REGEX_NUMBER, '密码需包含至少一个数字'),
    confirmPassword: z.string().min(1, '请确认密码'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

interface RegisterResponse {
  data: {
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    } | null;
    emailConfirmationRequired?: boolean;
  };
}

async function readRegisterErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const payload = (await error.response.json()) as {
        detail?: unknown;
        message?: unknown;
      };

      if (typeof payload.detail === 'string' && payload.detail.length > 0) {
        return payload.detail;
      }

      if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
      }
    } catch {
      /* noop */
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '注册过程中发生未知错误，请稍后重试';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const result = await apiClient
        .post('auth/register', {
          json: {
            email: data.email,
            password: data.password,
          },
        })
        .json<RegisterResponse>();

      if (
        result.data.tokens?.accessToken &&
        result.data.tokens.refreshToken
      ) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.data.tokens.accessToken,
          refresh_token: result.data.tokens.refreshToken,
        });

        if (sessionError) {
          setServerError('注册成功，但初始化登录状态失败，请前往登录页继续');
          navigate({
            to: '/login',
            search: { registered: 'true' },
          });
          return;
        }

        navigate({ to: '/onboarding' });
        return;
      }

      navigate({
        to: '/login',
        search: { registered: 'true' },
      });
    } catch (error) {
      setServerError(await readRegisterErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">创建账号</h1>
          <p className="mt-1 text-sm text-muted">
            注册一个 AgentLoom 账号
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {serverError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="register-email" className="text-xs font-medium text-foreground">邮箱</label>
            <Input
              id="register-email"
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
            <label htmlFor="register-password" className="text-xs font-medium text-foreground">密码</label>
            <PasswordInput
              id="register-password"
              placeholder="至少 8 个字符，含大写、小写和数字"
              autoComplete="new-password"
              error={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-error">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="register-confirmPassword" className="text-xs font-medium text-foreground">确认密码</label>
            <PasswordInput
              id="register-confirmPassword"
              placeholder="再次输入密码"
              autoComplete="new-password"
              error={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-error">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          已有账号？{' '}
          <Link to="/login" className="text-primary hover:underline">
            返回登录
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});
