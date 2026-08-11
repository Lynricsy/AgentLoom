import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Building2, UserPlus, Users } from 'lucide-react'
import { useAuthToken } from '@/features/execution'
import { getOrganizationIdFromToken } from '@/features/organization-autonomy-policy/lib/organizationAutonomyPolicyPermissions'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy/lib/policyPermissions'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  useOrganization,
  useOrganizationMembers,
} from '../api/organizationQueries'
import { InviteMemberDialog } from './InviteMemberDialog'
import { OrganizationMembersTable } from './OrganizationMembersTable'

const ORGANIZATION_TONE = 'var(--color-node-routing)'

function formatCreatedAt(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

interface InfoFieldProps {
  label: string
  children: ReactNode
}

function InfoField({ label, children }: InfoFieldProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function OrganizationSettingsPage() {
  const authToken = useAuthToken()
  const organizationId = useMemo(
    () => getOrganizationIdFromToken(authToken) ?? undefined,
    [authToken],
  )
  // 服务端 @Roles('owner','admin') 守卫成员管理，前端据同一角色隐藏入口
  const canManage = useMemo(() => {
    const role = getInterventionPolicyRoleFromToken(authToken)
    return role === 'owner' || role === 'admin'
  }, [authToken])

  const [inviteOpen, setInviteOpen] = useState(false)

  const organizationQuery = useOrganization(organizationId)
  const membersQuery = useOrganizationMembers(organizationId, {
    enabled: canManage,
  })

  const organization = organizationQuery.data

  if (!organizationId) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          icon={Building2}
          tone={ORGANIZATION_TONE}
          title="组织"
          description="管理组织信息与成员"
        />
        <EmptyState
          icon={Building2}
          tone={ORGANIZATION_TONE}
          title="当前账号未归属任何组织"
          description="登录凭证里没有组织信息。请联系管理员把你加入组织，或重新登录以刷新凭证。"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        icon={Building2}
        tone={ORGANIZATION_TONE}
        title="组织"
        description="管理组织信息与成员"
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              邀请成员
            </Button>
          ) : null
        }
      />

      {organizationQuery.isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        </Card>
      ) : organizationQuery.isError || !organization ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="组织信息加载失败"
          description="请稍后重试，或确认当前账号仍属于该组织。"
          action={
            <Button
              variant="outline"
              onClick={() => void organizationQuery.refetch()}
            >
              重新加载
            </Button>
          }
        />
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {organization.name}
            </h2>
            <Badge variant={organization.isActive ? 'success' : 'secondary'}>
              {organization.isActive ? '正常' : '已停用'}
            </Badge>
          </div>
          {organization.description ? (
            <p className="mt-1.5 text-sm text-muted">
              {organization.description}
            </p>
          ) : null}

          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoField label="标识">
              <code className="text-xs">{organization.slug}</code>
            </InfoField>
            <InfoField label="成员数">{organization.memberCount}</InfoField>
            <InfoField label="创建时间">
              {formatCreatedAt(organization.createdAt)}
            </InfoField>
            <InfoField label="组织 ID">
              <code className="text-xs">{organization.id}</code>
            </InfoField>
          </dl>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">成员名册</h2>
          {canManage && membersQuery.data?.length ? (
            <span className="text-xs text-muted">
              共 {membersQuery.data.length} 人
            </span>
          ) : null}
        </div>

        {canManage ? (
          <OrganizationMembersTable
            organizationId={organizationId}
            members={membersQuery.data ?? []}
            loading={membersQuery.isLoading}
            isError={membersQuery.isError}
            onRetry={() => void membersQuery.refetch()}
            canManage={canManage}
          />
        ) : (
          <EmptyState
            icon={Users}
            tone={ORGANIZATION_TONE}
            title="无权查看成员名册"
            description="仅组织所有者与管理员可以查看并管理成员。"
          />
        )}
      </section>

      <InviteMemberDialog
        organizationId={organizationId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  )
}
