import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { z } from "zod";

import { AuthLayout } from "@/features/auth";
import { MfaVerifyDialog } from "@/features/auth";
import { OAuthButtons } from "@/features/auth";
import { PasswordInput } from "@/features/auth";
import { Spinner } from "@/shared/components/spinner/Spinner";
import { supabase } from "@/shared/lib/supabase";
import { Button } from "@/shared/ui/button";
// FormItem 只提供字段行排版（不依赖 react-hook-form 上下文）；
// FormLabel 会把 htmlFor 落到 Label 的 <span> 上而无法建立标签关联，故这里用原生 <label>。
import { FormItem } from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { rootRoute } from "../__root";

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(1, "请输入密码"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// 临时隐藏第三方登录入口，保留底层 OAuth 实现便于后续恢复。
const SOCIAL_LOGIN_ENTRY_ENABLED = false;

const FIELD_LABEL_CLASS = "text-xs font-medium text-foreground";

export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMfaVerify, setShowMfaVerify] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleLoginSuccess = () => {
    const returnUrl = new URLSearchParams(window.location.search).get(
      "returnUrl",
    );
    if (returnUrl) {
      window.location.href = returnUrl;
    } else {
      navigate({ to: "/" });
    }
  };

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

      if (
        result.session === null &&
        result.user &&
        "factors" in result.user &&
        Array.isArray(result.user.factors) &&
        result.user.factors.length > 0
      ) {
        setMfaFactorId(result.user.factors[0]?.id ?? "");
        setShowMfaVerify(true);
        return;
      }

      handleLoginSuccess();
    } catch {
      setServerError("登录过程中发生未知错误，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="登录" subtitle="登录您的 AgentLoom 账号">
      <div className="space-y-6">
        {SOCIAL_LOGIN_ENTRY_ENABLED ? (
          <>
            <OAuthButtons disabled={isSubmitting} />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted">或</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

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
            <label htmlFor="login-email" className={FIELD_LABEL_CLASS}>
              邮箱
            </label>
            <Input
              id="login-email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              className={errors.email ? "border-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs font-medium text-error">
                {errors.email.message}
              </p>
            )}
          </FormItem>

          <FormItem>
            <label htmlFor="login-password" className={FIELD_LABEL_CLASS}>
              密码
            </label>
            <PasswordInput
              id="login-password"
              placeholder="输入密码"
              autoComplete="current-password"
              error={!!errors.password}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs font-medium text-error">
                {errors.password.message}
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
                登录中...
              </>
            ) : (
              "登录"
            )}
          </Button>
        </form>

        <p className="text-sm text-muted">
          还没有账号？{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            立即注册
          </Link>
        </p>
      </div>

      <MfaVerifyDialog
        open={showMfaVerify}
        factorId={mfaFactorId}
        onClose={() => setShowMfaVerify(false)}
        onSuccess={handleLoginSuccess}
      />
    </AuthLayout>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
