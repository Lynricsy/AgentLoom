import type { Dispatch, SetStateAction } from 'react'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import {
  Field,
  SecretStatusBlock,
  ToggleTile,
} from './PrivateDeploymentFormPrimitives'
import type { SmtpDraft } from '../lib/privateDeploymentPayloads'

export interface PrivateDeploymentSmtpCardProps {
  draft: SmtpDraft
  setDraft: Dispatch<SetStateAction<SmtpDraft>>
  hasManagedPassword: boolean
  isSubmitting: boolean
  onSubmit: () => void
  onClearSecret: () => void
}

/** SMTP 投递通道配置；受管密码只写不读 */
export function PrivateDeploymentSmtpCard({
  draft,
  setDraft,
  hasManagedPassword,
  isSubmitting,
  onSubmit,
  onClearSecret,
}: PrivateDeploymentSmtpCardProps) {
  return (
    <Card data-testid="private-deployment-smtp-form">
      <CardHeader>
        <CardTitle>SMTP</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          维护邮件投递通道。页面只展示是否存在受管密码，不会回显任何明文或 secret ref 内容。
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field htmlFor="private-deployment-smtp-host" label="SMTP 主机">
            <Input
              id="private-deployment-smtp-host"
              value={draft.host}
              aria-label="SMTP 主机"
              onChange={(event) =>
                setDraft((current) => ({ ...current, host: event.target.value }))
              }
              placeholder="例如 smtp.internal.ling.plus"
            />
          </Field>

          <Field htmlFor="private-deployment-smtp-port" label="SMTP 端口">
            <Input
              id="private-deployment-smtp-port"
              value={draft.port}
              aria-label="SMTP 端口"
              onChange={(event) =>
                setDraft((current) => ({ ...current, port: event.target.value }))
              }
              placeholder="例如 587"
            />
          </Field>

          <Field htmlFor="private-deployment-smtp-username" label="SMTP 用户名">
            <Input
              id="private-deployment-smtp-username"
              value={draft.username}
              aria-label="SMTP 用户名"
              onChange={(event) =>
                setDraft((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="例如 mailer"
            />
          </Field>

          <Field htmlFor="private-deployment-smtp-from-email" label="发件地址">
            <Input
              id="private-deployment-smtp-from-email"
              value={draft.fromEmail}
              aria-label="发件地址"
              onChange={(event) =>
                setDraft((current) => ({ ...current, fromEmail: event.target.value }))
              }
              placeholder="例如 noreply@ling.plus"
            />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Field htmlFor="private-deployment-smtp-password" label="SMTP 密码（仅替换时填写）">
            <Input
              id="private-deployment-smtp-password"
              type="password"
              value={draft.password}
              aria-label="SMTP 密码（仅替换时填写）"
              onChange={(event) =>
                setDraft((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="仅在需要替换受管密码时填写"
            />
          </Field>

          <ToggleTile
            title="启用 TLS"
            description="推荐在 SMTP 通道中开启 TLS，以保护邮件传输链路。"
            checked={draft.useTls}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, useTls: checked }))
            }
          />
        </div>

        <SecretStatusBlock
          title="SMTP 受管密码"
          configured={hasManagedPassword}
          description="若需轮换密码，请在上方填写一次性新值后保存；若需移除，则使用清除动作。"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? <Spinner size="sm" /> : null}
            保存 SMTP 设置
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClearSecret}
            disabled={isSubmitting || !hasManagedPassword}
          >
            清除当前 SMTP 密码
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
