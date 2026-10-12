import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { AuthLayout, useAuthLoading, useAuthStore, useIsAuthenticated } from '@/features/auth'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import { useAcceptOrganizationInvitation } from '../api/organizationQueries'
import { resolveOrganizationErrorMessage } from '../lib/organizationErrors'

/** 邀请页复用登录页的居中卡片（AuthLayout），内容是单一状态机，不显示标语 */
function InvitationShell({ children }: { children: ReactNode }) {
  return <AuthLayout subtitle={null}>{children}</AuthLayout>
}

export function AcceptInvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' })
  const navigate = useNavigate()
  const { notify } = useToast()
  const isAuthenticated = useIsAuthenticated()
  const isAuthLoading = useAuthLoading()
  const acceptMutation = useAcceptOrganizationInvitation()
  const queryClient = useQueryClient()

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
        // 服务端已把 current_organization_id 切到新组织：刷新 session 拿到新 tenant claim，
        // 再清空按旧租户缓存的查询，避免工作台短暂展示上一个组织的数据
        await useAuthStore.getState().refreshAndCheckTenant()
        queryClient.clear()
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
            className="grid size-11 place-items-center rounded-lg bg-error/10 text-error"
          >
            <AlertTriangle className="size-5" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            邀请无法接受
          </h2>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{error}</p>
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
            className="grid size-11 place-items-center rounded-lg bg-success/10 text-success"
          >
            <CheckCircle2 className="size-5" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            已加入组织
          </h2>
          <p className="text-sm text-muted-foreground">正在带你前往工作台…</p>
        </div>
      </InvitationShell>
    )
  }

  return (
    <InvitationShell>
      <div className="flex items-center gap-3">
        <Spinner size="lg" className="size-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            正在接受邀请
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">请稍候，正在校验邀请链接。</p>
        </div>
      </div>
    </InvitationShell>
  )
}
