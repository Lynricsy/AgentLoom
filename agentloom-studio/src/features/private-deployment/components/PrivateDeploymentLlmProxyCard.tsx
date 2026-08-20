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
import {
  Field,
  SecretStatusBlock,
  ToggleTile,
} from './PrivateDeploymentFormPrimitives'
import type { LlmProxyDraft } from '../lib/privateDeploymentPayloads'
import type { PrivateDeploymentLlmProxyMode } from '../types/privateDeployment'

const LLM_PROXY_MODE_OPTIONS: Array<{
  value: PrivateDeploymentLlmProxyMode
  label: string
  description: string
}> = [
  {
    value: 'direct',
    label: 'direct（平台直连）',
    description: '由平台直接访问默认模型出口，不需要额外的代理地址。',
  },
  {
    value: 'private_cloud',
    label: 'private_cloud（私有云代理）',
    description: '通过 OpenAI 兼容的推理端点访问私有云模型，例如 vLLM、Ollama 或 LocalAI。',
  },
  {
    value: 'enterprise_proxy',
    label: 'enterprise_proxy（企业代理）',
    description: '通过企业统一出口代理访问模型，并显式允许外部网络出口。',
  },
]

export interface PrivateDeploymentLlmProxyCardProps {
  draft: LlmProxyDraft
  setDraft: Dispatch<SetStateAction<LlmProxyDraft>>
  hasManagedApiKey: boolean
  isSubmitting: boolean
  onSubmit: () => void
  onClearSecret: () => void
}

/** LLM 代理模式、基地址与受管 API Key */
export function PrivateDeploymentLlmProxyCard({
  draft,
  setDraft,
  hasManagedApiKey,
  isSubmitting,
  onSubmit,
  onClearSecret,
}: PrivateDeploymentLlmProxyCardProps) {
  return (
    <Card data-testid="private-deployment-llm-proxy-form">
      <CardHeader>
        <CardTitle>LLM 代理</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          管理 `llmProxy` 模式、代理基地址和受管 API Key。不要在页面中展示或回填任何已保存的 Key 明文。
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Field htmlFor="private-deployment-llm-proxy-mode" label="代理模式">
            <Select
              value={draft.mode}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  mode: value as PrivateDeploymentLlmProxyMode,
                }))
              }
            >
              <SelectTrigger id="private-deployment-llm-proxy-mode" aria-label="代理模式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROXY_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <p className="self-end rounded-card border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
            {
              LLM_PROXY_MODE_OPTIONS.find((option) => option.value === draft.mode)
                ?.description
            }
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Field htmlFor="private-deployment-llm-proxy-base-url" label="代理基地址">
            <Input
              id="private-deployment-llm-proxy-base-url"
              value={draft.baseUrl}
              aria-label="代理基地址"
              onChange={(event) =>
                setDraft((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="OpenAI 兼容的推理端点地址，例如 https://llm.internal/v1"
            />
          </Field>

          <ToggleTile
            title="允许外部网络出口"
            description="enterprise_proxy 模式必须开启该选项，以匹配后端校验约束。"
            checked={draft.allowExternalEgress}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, allowExternalEgress: checked }))
            }
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            htmlFor="private-deployment-llm-proxy-api-key"
            label="代理 API Key（仅替换时填写）"
          >
            <Input
              id="private-deployment-llm-proxy-api-key"
              type="password"
              value={draft.apiKey}
              aria-label="代理 API Key（仅替换时填写）"
              onChange={(event) =>
                setDraft((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder="仅在需要替换受管 API Key 时填写"
            />
          </Field>

          <SecretStatusBlock
            title="LLM 代理受管 API Key"
            configured={hasManagedApiKey}
            description="如果当前代理需要凭证，请填写新的 API Key 进行替换；页面不会回显任何历史值。"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? <Spinner size="sm" /> : null}
            保存 LLM 代理设置
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClearSecret}
            disabled={isSubmitting || !hasManagedApiKey}
          >
            清除当前代理 API Key
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
