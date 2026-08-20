import type { Dispatch, SetStateAction } from 'react'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { Field } from './PrivateDeploymentFormPrimitives'
import {
  formatTimestamp,
  type CertificatesDraft,
} from '../lib/privateDeploymentPayloads'
import type { PrivateDeploymentCertificateSource } from '../types/privateDeployment'

const CERTIFICATE_SOURCE_OPTIONS: Array<{
  value: PrivateDeploymentCertificateSource
  label: string
  description: string
}> = [
  {
    value: 'ingress-managed',
    label: 'ingress-managed（由入口统一管理）',
    description: '证书由部署入口或 Ingress 统一维护，Studio 仅记录状态信息。',
  },
  {
    value: 'secretRef',
    label: 'secretRef（引用现有密钥）',
    description: '引用平台外部或集群中已经存在的 TLS secret。',
  },
  {
    value: 'uploaded',
    label: 'uploaded（上传新的 PEM 材料）',
    description: '重新提交证书 PEM 与私钥 PEM。已上传的旧材料不会再次回显。',
  },
]

export interface PrivateDeploymentCertificatesCardProps {
  draft: CertificatesDraft
  setDraft: Dispatch<SetStateAction<CertificatesDraft>>
  serverExpiresAt: string | null | undefined
  isSubmitting: boolean
  onSubmit: () => void
}

/** TLS 证书来源、secret 引用与可选过期时间 */
export function PrivateDeploymentCertificatesCard({
  draft,
  setDraft,
  serverExpiresAt,
  isSubmitting,
  onSubmit,
}: PrivateDeploymentCertificatesCardProps) {
  return (
    <Card data-testid="private-deployment-certificates-form">
      <CardHeader>
        <CardTitle>证书管理</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          维护 `certificates` 来源、TLS secret 引用和可选过期时间。已上传的证书材料不会在页面中重新显示。
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Field htmlFor="private-deployment-certificates-source" label="证书来源">
            <Select
              value={draft.source}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  source: value as PrivateDeploymentCertificateSource,
                }))
              }
            >
              <SelectTrigger id="private-deployment-certificates-source" aria-label="证书来源">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERTIFICATE_SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
            {
              CERTIFICATE_SOURCE_OPTIONS.find(
                (option) => option.value === draft.source,
              )?.description
            }
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            htmlFor="private-deployment-certificates-expires-at"
            label="证书过期时间（可选）"
          >
            <Input
              id="private-deployment-certificates-expires-at"
              type="datetime-local"
              value={draft.expiresAt}
              aria-label="证书过期时间（可选）"
              onChange={(event) =>
                setDraft((current) => ({ ...current, expiresAt: event.target.value }))
              }
            />
          </Field>

          <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
            当前服务端记录的证书到期时间：{formatTimestamp(serverExpiresAt)}
          </p>
        </div>

        {draft.source === 'secretRef' ? (
          <Field
            htmlFor="private-deployment-certificates-tls-secret-ref"
            label="TLS Secret 引用"
          >
            <Input
              id="private-deployment-certificates-tls-secret-ref"
              value={draft.tlsSecretRef}
              aria-label="TLS Secret 引用"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  tlsSecretRef: event.target.value,
                }))
              }
              placeholder="例如 k8s://secrets/namespace/tls-secret"
            />
          </Field>
        ) : null}

        {draft.source === 'uploaded' ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              htmlFor="private-deployment-certificates-certificate-pem"
              label="证书 PEM（仅替换时填写）"
            >
              <Textarea
                id="private-deployment-certificates-certificate-pem"
                value={draft.certificatePem}
                rows={8}
                aria-label="证书 PEM（仅替换时填写）"
                className="resize-y font-mono"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    certificatePem: event.target.value,
                  }))
                }
                placeholder="粘贴新的证书 PEM 内容"
              />
            </Field>

            <Field
              htmlFor="private-deployment-certificates-private-key-pem"
              label="私钥 PEM（仅替换时填写）"
            >
              <Textarea
                id="private-deployment-certificates-private-key-pem"
                value={draft.privateKeyPem}
                rows={8}
                aria-label="私钥 PEM（仅替换时填写）"
                className="resize-y font-mono"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    privateKeyPem: event.target.value,
                  }))
                }
                placeholder="粘贴新的私钥 PEM 内容"
              />
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? <Spinner size="sm" /> : null}
            保存证书设置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
