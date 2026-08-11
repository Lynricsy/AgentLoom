import { useState } from 'react'
import { AlertCircle, Loader2, UserMinus, Users } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import {
  useRemoveOrganizationMember,
  useUpdateOrganizationMemberRole,
} from '../api/organizationQueries'
import { resolveOrganizationErrorMessage } from '../lib/organizationErrors'
import {
  ORGANIZATION_ROLES,
  ORGANIZATION_ROLE_LABELS,
  type OrganizationMember,
  type OrganizationRole,
} from '../types'

/** 角色徽章配色：所有者最醒目，只读角色最弱 */
const ROLE_BADGE_VARIANT: Record<
  OrganizationRole,
  'default' | 'info' | 'secondary'
> = {
  owner: 'default',
  admin: 'info',
  creator: 'info',
  operator: 'secondary',
  viewer: 'secondary',
}

function formatJoinedAt(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface OrganizationMembersTableProps {
  organizationId?: string
  members: OrganizationMember[]
  loading: boolean
  isError: boolean
  onRetry: () => void
  /** owner/admin 才能改角色与移除成员 */
  canManage: boolean
}

export function OrganizationMembersTable({
  organizationId,
  members,
  loading,
  isError,
  onRetry,
  canManage,
}: OrganizationMembersTableProps) {
  const { notify } = useToast()
  const updateRoleMutation = useUpdateOrganizationMemberRole(organizationId)
  const removeMutation = useRemoveOrganizationMember(organizationId)

  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<OrganizationMember | null>(
    null,
  )

  const handleRoleChange = async (
    member: OrganizationMember,
    nextRole: OrganizationRole,
  ) => {
    if (nextRole === member.role) {
      return
    }

    setPendingUserId(member.userId)

    try {
      await updateRoleMutation.mutateAsync({
        userId: member.userId,
        role: nextRole,
      })
      notify({
        title: '角色已更新',
        description: `${member.email} 现在是「${ORGANIZATION_ROLE_LABELS[nextRole]}」。`,
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '角色更新失败',
        description: await resolveOrganizationErrorMessage(
          error,
          '请稍后重试，或确认你有权限修改该成员。',
        ),
        variant: 'error',
      })
    } finally {
      setPendingUserId(null)
    }
  }

  const handleRemove = async () => {
    if (!confirmRemove) {
      return
    }

    const member = confirmRemove

    try {
      await removeMutation.mutateAsync(member.userId)
      setConfirmRemove(null)
      notify({
        title: '成员已移除',
        description: `${member.email} 已退出该组织。`,
        variant: 'success',
      })
    } catch (error) {
      // 409 = 唯一所有者不可移除，服务端文案直接透出
      notify({
        title: '移除失败',
        description: await resolveOrganizationErrorMessage(
          error,
          '请稍后重试，或确认你有权限移除该成员。',
        ),
        variant: 'error',
      })
    }
  }

  const columns: DataTableColumn<OrganizationMember>[] = [
    {
      key: 'email',
      header: '邮箱',
      // w-full max-w-0 让 truncate 在表格布局里真正生效，长邮箱不会顶宽整表
      className: 'w-full max-w-0',
      cell: (member) => (
        <span className="block truncate font-medium text-foreground">
          {member.email}
        </span>
      ),
    },
    {
      key: 'displayName',
      header: '显示名',
      hideBelow: 'sm',
      cell: (member) => member.displayName ?? <span className="text-muted">未设置</span>,
    },
    {
      key: 'role',
      header: '角色',
      className: 'w-40',
      cell: (member) =>
        canManage ? (
          <Select
            value={member.role}
            disabled={pendingUserId === member.userId}
            onValueChange={(value) =>
              void handleRoleChange(member, value as OrganizationRole)
            }
          >
            <SelectTrigger
              className="h-8"
              aria-label={`${member.email} 的角色`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORGANIZATION_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ORGANIZATION_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={ROLE_BADGE_VARIANT[member.role]}>
            {ORGANIZATION_ROLE_LABELS[member.role]}
          </Badge>
        ),
    },
    {
      key: 'createdAt',
      header: '加入时间',
      hideBelow: 'md',
      className: 'text-muted',
      cell: (member) => formatJoinedAt(member.createdAt),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '操作',
            className: 'w-16 text-right',
            cell: (member: OrganizationMember) => (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`移除 ${member.email}`}
                onClick={() => setConfirmRemove(member)}
              >
                <UserMinus className="h-4 w-4" />
              </Button>
            ),
          } satisfies DataTableColumn<OrganizationMember>,
        ]
      : []),
  ]

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="var(--color-error)"
        title="成员名册加载失败"
        description="可能是网络异常，或你的角色无权查看成员名单。"
        action={
          <Button variant="outline" onClick={onRetry}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={members}
        loading={loading}
        rowKey={(member) => member.userId}
        empty={
          <EmptyState
            icon={Users}
            title="暂无成员"
            description="邀请同事加入组织后，成员会出现在这里。"
          />
        }
      />

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>移除成员</AlertDialogTitle>
          <AlertDialogDescription>
            确定要把 {confirmRemove?.email} 移出组织吗？该成员将立即失去组织内全部资源的访问权限。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={removeMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                void handleRemove()
              }}
            >
              {removeMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              移除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
