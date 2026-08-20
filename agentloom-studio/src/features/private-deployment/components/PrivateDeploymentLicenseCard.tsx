import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Textarea } from '@/shared/ui/textarea'
import { Field, MetaTile } from './PrivateDeploymentFormPrimitives'
import {
  formatNullableValue,
  formatTimestamp,
  type LicenseDraft,
} from '../lib/privateDeploymentPayloads'
import type {
  PrivateDeploymentLicenseStatus,
  PrivateDeploymentSettings,
} from '../types/privateDeployment'

const LICENSE_STATUS_LABELS: Record<PrivateDeploymentLicenseStatus, string> = {
  missing: '缺失',
  valid: '有效',
  invalid: '无效',
  expired: '已过期',
}

export interface PrivateDeploymentLicenseCardProps {
  draft: LicenseDraft
  setDraft: (draft: LicenseDraft) => void
  license: PrivateDeploymentSettings['license']
  isSubmitting: boolean
  onSubmit: () => void
}

/** 离线 License 状态与一次性提交入口 */
export function PrivateDeploymentLicenseCard({
  draft,
  setDraft,
  license,
  isSubmitting,
  onSubmit,
}: PrivateDeploymentLicenseCardProps) {
  return (
    <Card data-testid="private-deployment-license-form">
      <CardHeader>
        <CardTitle>License 管理</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          这里只展示 License 校验状态和元数据。新的 License Key 只会一次性提交，不会回显历史内容。
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetaTile label="状态" value={LICENSE_STATUS_LABELS[license.status]} />
          <MetaTile label="指纹" value={formatNullableValue(license.fingerprint)} />
          <MetaTile label="到期时间" value={formatTimestamp(license.expiresAt)} />
          <MetaTile label="最近校验" value={formatTimestamp(license.lastVerifiedAt)} />
        </div>

        <Field htmlFor="private-deployment-license-key" label="新的 License Key">
          <Textarea
            id="private-deployment-license-key"
            value={draft.licenseKey}
            rows={6}
            aria-label="新的 License Key"
            className="resize-y font-mono"
            onChange={(event) => setDraft({ licenseKey: event.target.value })}
            placeholder="粘贴新的离线 License Key。提交后页面仅显示状态、指纹和校验时间。"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? <Spinner size="sm" /> : null}
            保存 License 设置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
