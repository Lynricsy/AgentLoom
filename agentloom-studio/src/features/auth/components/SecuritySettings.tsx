import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  KeyRound,
  Loader2,
  Monitor,
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
} from 'lucide-react'

import { apiClient } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'

import { useAuth } from '../hooks/useAuth'
import { useMfa } from '../hooks/useMfa'
import { MfaEnrollDialog } from './MfaEnrollDialog'
import { PasswordInput } from './PasswordInput'

interface SessionInfo {
  id: string
  createdAt: string
  updatedAt: string
  userAgent: string
  ip: string
  isCurrent: boolean
}

interface SecurityInfo {
  mfaEnabled: boolean
  activeMfaFactors: Array<{ id: string; type: string; createdAt: string }>
}

interface SecurityInfoResponse {
  mfa: {
    enabled: boolean
    factors: Array<{
      id: string
      factorType: string
      status: 'verified' | 'unverified'
      createdAt: string
    }>
  }
}

interface SessionListResponse {
  data: {
    sessions: Array<{
      id: string
      userAgent: string | null
      ip: string | null
      createdAt: string | null
      lastActiveAt: string | null
      isCurrent: boolean
    }>
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z
      .string()
      .min(8, '密码至少 8 个字符')
      .regex(/[A-Z]/, '需要至少一个大写字母')
      .regex(/[a-z]/, '需要至少一个小写字母')
      .regex(/\d/, '需要至少一个数字'),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

export function SecuritySettings() {
  const { user } = useAuth()
  const { notify } = useToast()
  const mfa = useMfa()

  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null)
  const [securityLoading, setSecurityLoading] = useState(true)

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [mfaDialogOpen, setMfaDialogOpen] = useState(false)
  const [mfaDisabling, setMfaDisabling] = useState(false)

  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const fetchSecurityInfo = useCallback(async () => {
    try {
      setSecurityLoading(true)
      const response = await apiClient
        .get('auth/security')
        .json<SecurityInfoResponse>()
      setSecurityInfo({
        mfaEnabled: response.mfa.enabled,
        activeMfaFactors: response.mfa.factors
          .filter((factor) => factor.status === 'verified')
          .map((factor) => ({
            id: factor.id,
            type: factor.factorType,
            createdAt: factor.createdAt,
          })),
      })
    } catch {
      setSecurityInfo({ mfaEnabled: false, activeMfaFactors: [] })
    } finally {
      setSecurityLoading(false)
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      setSessionsLoading(true)
      const response = await apiClient
        .get('auth/sessions')
        .json<SessionListResponse>()
      setSessions(
        response.data.sessions.map((session) => ({
          id: session.id,
          createdAt: session.createdAt ?? '',
          updatedAt: session.lastActiveAt ?? session.createdAt ?? '',
          userAgent: session.userAgent ?? '',
          ip: session.ip ?? '',
          isCurrent: session.isCurrent,
        })),
      )
    } catch {
      notify({ description: '获取会话列表失败', variant: 'error' })
    } finally {
      setSessionsLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void fetchSecurityInfo()
    void fetchSessions()
  }, [fetchSecurityInfo, fetchSessions])

  const onPasswordSubmit = useCallback(
    async (data: PasswordFormData) => {
      try {
        setPasswordSubmitting(true)
        await apiClient
          .patch('auth/password', {
            json: {
              currentPassword: data.currentPassword,
              newPassword: data.newPassword,
            },
          })
          .json()
        notify({ description: '密码修改成功', variant: 'success' })
        resetForm()
      } catch {
        notify({ description: '密码修改失败，请检查当前密码是否正确', variant: 'error' })
      } finally {
        setPasswordSubmitting(false)
      }
    },
    [notify, resetForm],
  )

  const handleEnableMfa = useCallback(() => {
    setMfaDialogOpen(true)
  }, [])

  const handleMfaEnrollSuccess = useCallback(() => {
    setMfaDialogOpen(false)
    void fetchSecurityInfo()
    notify({ description: 'MFA 已启用', variant: 'success' })
  }, [fetchSecurityInfo, notify])

  const handleDisableMfa = useCallback(async () => {
    const factors = securityInfo?.activeMfaFactors
    if (!factors?.length) return

    try {
      setMfaDisabling(true)
      await mfa.unenrollTotp(factors[0]!.id)
      void fetchSecurityInfo()
      notify({ description: 'MFA 已禁用', variant: 'success' })
    } catch {
      notify({ description: '禁用 MFA 失败', variant: 'error' })
    } finally {
      setMfaDisabling(false)
    }
  }, [securityInfo, mfa, fetchSecurityInfo, notify])

  const handleRevokeSession = useCallback(
    async (sessionId: string) => {
      try {
        setRevokingId(sessionId)
        await apiClient.delete(`auth/sessions/${sessionId}`).json()
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        notify({ description: '会话已撤销', variant: 'success' })
      } catch {
        notify({ description: '撤销会话失败', variant: 'error' })
      } finally {
        setRevokingId(null)
      }
    },
    [notify],
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8" data-testid="security-settings">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">安全设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理您的密码、多因素认证和活跃会话
        </p>
      </div>

      <div className="space-y-6">
        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="password-section"
        >
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">修改密码</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            定期修改密码可以提高账户安全性
          </p>

          <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-foreground">
                当前密码
              </label>
              <PasswordInput
                id="currentPassword"
                data-testid="current-password"
                placeholder="输入当前密码"
                error={!!errors.currentPassword}
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="mt-1 text-xs text-error" data-testid="current-password-error">
                  {errors.currentPassword.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-foreground">
                新密码
              </label>
              <PasswordInput
                id="newPassword"
                data-testid="new-password"
                placeholder="至少 8 个字符，包含大小写字母和数字"
                error={!!errors.newPassword}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-error" data-testid="new-password-error">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-foreground">
                确认新密码
              </label>
              <PasswordInput
                id="confirmPassword"
                data-testid="confirm-password"
                placeholder="再次输入新密码"
                error={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-error" data-testid="confirm-password-error">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={passwordSubmitting} data-testid="change-password-btn">
                {passwordSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    修改中…
                  </>
                ) : (
                  '修改密码'
                )}
              </Button>
            </div>
          </form>
        </section>

        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="mfa-section"
        >
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">多因素认证 (MFA)</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            启用 MFA 为您的账户添加额外的安全保护层
          </p>

          {securityLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="mfa-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : securityInfo?.mfaEnabled ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4" data-testid="mfa-enabled">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                <span className="text-sm font-medium text-success">MFA 已启用</span>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                您的账户已通过 TOTP 验证器保护
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisableMfa}
                disabled={mfaDisabling}
                data-testid="disable-mfa-btn"
              >
                {mfaDisabling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    禁用中…
                  </>
                ) : (
                  <>
                    <ShieldOff className="mr-2 h-4 w-4" />
                    禁用 MFA
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-background/30 p-4" data-testid="mfa-disabled">
              <div className="mb-3 flex items-center gap-2">
                <ShieldOff className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">MFA 未启用</span>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                建议启用 MFA 以增强账户安全性
              </p>
              <Button size="sm" onClick={handleEnableMfa} data-testid="enable-mfa-btn">
                <ShieldCheck className="mr-2 h-4 w-4" />
                启用 MFA
              </Button>
            </div>
          )}
        </section>

        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="sessions-section"
        >
          <div className="mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">活跃会话</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            查看和管理所有已登录的设备和会话
          </p>

          {sessionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="sessions-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="sessions-empty">
              暂无活跃会话
            </p>
          ) : (
            <div className="space-y-3" data-testid="sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/30 p-4"
                  data-testid={`session-${session.id}`}
                >
                  <div className="flex items-center gap-3">
                    {session.userAgent?.toLowerCase().includes('mobile') ? (
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Monitor className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {parseUserAgent(session.userAgent)}
                        </span>
                        {session.isCurrent && (
                          <span
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            data-testid="current-session-badge"
                          >
                            当前会话
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        <span>{session.ip || '未知 IP'}</span>
                        <span className="mx-1">·</span>
                        <span>{formatSessionTime(session.updatedAt || session.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeSession(session.id)}
                      disabled={revokingId === session.id}
                      data-testid={`revoke-session-${session.id}`}
                    >
                      {revokingId === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-error" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <MfaEnrollDialog
        open={mfaDialogOpen}
        onClose={() => setMfaDialogOpen(false)}
        onSuccess={handleMfaEnrollSuccess}
      />

      <span className="sr-only" data-testid="security-user-email">
        {user?.email}
      </span>
    </div>
  )
}

function parseUserAgent(ua: string): string {
  if (!ua) return '未知设备'

  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome 浏览器'
  if (ua.includes('Firefox')) return 'Firefox 浏览器'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari 浏览器'
  if (ua.includes('Edg')) return 'Edge 浏览器'
  if (ua.includes('Mobile')) return '移动设备'

  return '未知浏览器'
}

function formatSessionTime(isoString: string): string {
  if (!isoString) return '未知时间'

  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return '未知时间'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`

    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} 小时前`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays} 天前`

    return date.toLocaleDateString('zh-CN')
  } catch {
    return '未知时间'
  }
}
