import { useEffect, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import { useInviteOrganizationMember } from '../api/organizationQueries'
import { resolveOrganizationErrorMessage } from '../lib/organizationErrors'
import {
  ORGANIZATION_ROLES,
  ORGANIZATION_ROLE_DESCRIPTIONS,
  ORGANIZATION_ROLE_LABELS,
  type OrganizationRole,
} from '../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface InviteMemberDialogProps {
  organizationId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteMemberDialog({
  organizationId,
  open,
  onOpenChange,
}: InviteMemberDialogProps) {
  const { notify } = useToast()
  const inviteMutation = useInviteOrganizationMember(organizationId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrganizationRole>('viewer')
  const [error, setError] = useState<string | null>(null)

  // 每次打开都回到初始状态，避免上一次的报错与邮箱残留
  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('viewer')
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    const trimmed = email.trim()

    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('请输入有效的邮箱地址。')
      return
    }

    setError(null)

    try {
      await inviteMutation.mutateAsync({ email: trimmed, role })
      notify({
        title: '邀请已发送',
        description: `已向 ${trimmed} 发送加入邀请，接受后即成为「${ORGANIZATION_ROLE_LABELS[role]}」。`,
        variant: 'success',
      })
      onOpenChange(false)
    } catch (err) {
      const message = await resolveOrganizationErrorMessage(
        err,
        '邀请发送失败，请稍后重试。',
      )
      setError(message)
      notify({ title: '邀请失败', description: message, variant: 'error' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>邀请成员</DialogTitle>
          <DialogDescription>
            向对方邮箱发送邀请链接，接受后按所选角色加入组织。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="invite-member-email"
              className="text-xs font-medium text-muted"
            >
              邮箱
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="invite-member-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="invite-member-role"
              className="text-xs font-medium text-muted"
            >
              角色
            </label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as OrganizationRole)}
            >
              <SelectTrigger id="invite-member-role" aria-label="邀请角色">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ORGANIZATION_ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              {ORGANIZATION_ROLE_DESCRIPTIONS[role]}
            </p>
          </div>

          {error ? (
            <p className="text-xs font-medium text-error">{error}</p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={inviteMutation.isPending}
          >
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={inviteMutation.isPending}
          >
            {inviteMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            发送邀请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
