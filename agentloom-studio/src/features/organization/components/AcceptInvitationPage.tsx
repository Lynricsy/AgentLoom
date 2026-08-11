import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useAuthLoading, useIsAuthenticated } from '@/features/auth'
import { BrandMark } from '@/shared/components/brand'
import { fadeInUp } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { useToast } from '@/shared/ui/toast'
import { useAcceptOrganizationInvitation } from '../api/organizationQueries'
import { resolveOrganizationErrorMessage } from '../lib/organizationErrors'

/** 邀请页与登录页共用居中卡片视觉，但内容是单一状态机，不复用 AuthLayout 的标题结构 */
function InvitationShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-56 left-1/2 h-[26rem] w-[34rem] -translate-x-1/2 rounded-full opacity-[0.10] blur-3xl"
          style={{ backgroundImage: 'var(--color-brand-gradient)' }}
        />
      </div>

      <motion.div {...fadeInUp} className="relative w-full max-w-md">
        <Card className="rounded-panel p-6 shadow-popover sm:p-8">
          <div className="flex items-center gap-3">
            <BrandMark size="md" className="bg-surface ring-border" />
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                AgentLoom
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.28em] text-primary">
                Studio
              </span>
            </div>
          </div>

          <div className="mt-7">{children}</div>
        </Card>
      </motion.div>
    </div>
  )
}

export function AcceptInvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' })
  const navigate = useNavigate()
  const { notify } = useToast()
  const isAuthenticated = useIsAuthenticated()
  const isAuthLoading = useAuthLoading()
  const acceptMutation = useAcceptOrganizationInvitation()

  const [error, setError] = useState<string | null>(null)
  // 邀请一次性消费，StrictMode 双渲染或重渲染都不能重复 POST
  const acceptedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent(`/invitations/${token}`)
      window.location.href = `/login?returnUrl=${returnUrl}`
      return
    }

    if (acceptedTokenRef.current === token) {
      return
    }

    acceptedTokenRef.current = token

    void (async () => {
      try {
        const result = await acceptMutation.mutateAsync(token)
        notify({
          title: '已加入组织',
          description: `欢迎加入「${result.organization.name}」。`,
          variant: 'success',
        })
        await navigate({ to: '/workflows' })
      } catch (err) {
        setError(
          await resolveOrganizationErrorMessage(
            err,
            '邀请无法接受，可能已过期、已被使用或链接有误。',
          ),
        )
      }
    })()
    // acceptMutation / navigate / notify 的引用每次渲染都会变，纳入依赖会重复触发邀请消费
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, isAuthLoading])

  if (error) {
    return (
      <InvitationShell>
        <div className="flex flex-col items-start gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-card bg-error/10 text-error"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            邀请无法接受
          </h1>
          <p className="text-sm text-muted">{error}</p>
          <Button
            className="mt-2"
            variant="outline"
            onClick={() => void navigate({ to: '/workflows' })}
          >
            返回工作台
          </Button>
        </div>
      </InvitationShell>
    )
  }

  if (acceptMutation.isSuccess) {
    return (
      <InvitationShell>
        <div className="flex flex-col items-start gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-card bg-success/10 text-success"
          >
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            已加入组织
          </h1>
          <p className="text-sm text-muted">正在带你前往工作台…</p>
        </div>
      </InvitationShell>
    )
  }

  return (
    <InvitationShell>
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            正在接受邀请
          </h1>
          <p className="mt-0.5 text-sm text-muted">请稍候，正在校验邀请链接。</p>
        </div>
      </div>
    </InvitationShell>
  )
}
