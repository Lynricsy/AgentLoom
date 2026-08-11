import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, createRoute, useNavigate } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { HTTPError } from 'ky';
import { z } from 'zod';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { Spinner } from '@/shared/components/spinner/Spinner';
import { apiClient } from '@/shared/api/client';
import { supabase } from '@/shared/lib/supabase';
import { Button } from '@/shared/ui/button';
// FormItem 只提供字段行排版（不依赖 react-hook-form 上下文）；
// FormLabel 会把 htmlFor 落到 Label 的 <span> 上而无法建立标签关联，故这里用原生 <label>。
import { FormItem } from '@/shared/ui/form';
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
    tokens?: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    } | null;
    emailConfirmationRequired?: boolean;
  };
}

const FIELD_LABEL_CLASS = 'text-xs font-medium text-foreground';

async function readRegisterErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const body = (await error.response.json()) as {
        message?: string | string[];
      };
      if (Array.isArray(body.message)) {
        return body.message.join('；');
      }
      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message;
      }
    } catch {
      // 响应体不是 JSON 时回落到通用错误文案
    }

    if (error.response.status === 409) {
      return '该邮箱已被注册，请直接登录';
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
    <AuthLayout title="创建账号" subtitle="注册一个 AgentLoom 账号">
      <div className="space-y-6">
        {/* noValidate：校验反馈统一由 zod schema 提供，避免浏览器原生气泡与之并存 */}
        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-card border border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{serverError}</span>
            </div>
          )}

          <FormItem>
            <label htmlFor="register-email" className={FIELD_LABEL_CLASS}>
              邮箱
            </label>
            <Input
              id="register-email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              className={errors.email ? 'border-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs font-medium text-error">
                {errors.email.message}
              </p>
            )}
          </FormItem>

          <FormItem>
            <label htmlFor="register-password" className={FIELD_LABEL_CLASS}>
              密码
            </label>
            <PasswordInput
              id="register-password"
              placeholder="至少 8 个字符，含大写、小写和数字"
              autoComplete="new-password"
              error={!!errors.password}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs font-medium text-error">
                {errors.password.message}
              </p>
            )}
          </FormItem>

          <FormItem>
            <label
              htmlFor="register-confirmPassword"
              className={FIELD_LABEL_CLASS}
            >
              确认密码
            </label>
            <PasswordInput
              id="register-confirmPassword"
              placeholder="再次输入密码"
              autoComplete="new-password"
              error={!!errors.confirmPassword}
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs font-medium text-error">
                {errors.confirmPassword.message}
              </p>
            )}
          </FormItem>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner className="text-primary-foreground" />
                注册中...
              </>
            ) : (
              '注册'
            )}
          </Button>
        </form>

        <p className="text-sm text-muted">
          已有账号？{' '}
          <Link
            to="/login"
            className="font-medium text-primary hover:underline"
          >
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
