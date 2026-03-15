import { useCallback, useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select } from '@/shared/ui/select'
import { AUTH_METHODS, type AuthMethod, type PrivateCloudModelInfo } from '../types'
import { usePrivateCloudModels, useTestPrivateCloudConnection } from '../hooks/useLlmModels'

const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  api_key: 'API Key',
  mtls: 'mTLS 证书',
  none: '无认证',
}

interface ConnectionStatus {
  success: boolean
  latencyMs?: number
  error?: string
}

interface LlmModelFormValues {
  name: string
  provider: string
  modelName: string
  apiKeyId: string
  endpointUrl: string
  authMethod: string
  authConfig: Record<string, unknown>
  timeoutMs: number | undefined
  temperature: number
  maxTokens: string
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stop: string[]
}

export function PrivateCloudConfigSection() {
  const form = useFormContext<LlmModelFormValues>()
  const testConnectionMutation = useTestPrivateCloudConnection()
  const fetchModelsMutation = usePrivateCloudModels()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)
  const [remoteModels, setRemoteModels] = useState<PrivateCloudModelInfo[]>([])

  const endpointUrl = useWatch({ control: form.control, name: 'endpointUrl' })
  const authMethod = useWatch({ control: form.control, name: 'authMethod' })

  const buildConnectionInput = useCallback(() => {
    const currentEndpointUrl = form.getValues('endpointUrl')
    const currentAuthMethod = form.getValues('authMethod') as AuthMethod
    const currentAuthConfig = form.getValues('authConfig')
    const currentTimeoutMs = form.getValues('timeoutMs')

    return {
      endpointUrl: currentEndpointUrl,
      authMethod: currentAuthMethod || 'none' as AuthMethod,
      authConfig: currentAuthConfig && Object.keys(currentAuthConfig).length > 0
        ? { apiKey: currentAuthConfig.apiKey as string | undefined, certPath: currentAuthConfig.certPath as string | undefined, keyPath: currentAuthConfig.keyPath as string | undefined }
        : undefined,
      timeoutMs: currentTimeoutMs,
    }
  }, [form])

  const handleTestConnection = useCallback(async () => {
    const currentEndpointUrl = form.getValues('endpointUrl')
    if (!currentEndpointUrl) {
      setConnectionStatus({ success: false, error: '请先输入端点 URL' })
      return
    }

    setConnectionStatus(null)
    setRemoteModels([])

    try {
      const result = await testConnectionMutation.mutateAsync(buildConnectionInput())
      if (result.success) {
        setConnectionStatus({ success: true, latencyMs: result.latencyMs })
      } else {
        setConnectionStatus({ success: false, error: '连接失败，请检查端点地址和认证配置' })
      }
    } catch (error) {
      setConnectionStatus({
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
      })
    }
  }, [buildConnectionInput, form, testConnectionMutation])

  const handleFetchModels = useCallback(async () => {
    try {
      const input = buildConnectionInput()
      const models = await fetchModelsMutation.mutateAsync({
        endpointUrl: input.endpointUrl,
        authMethod: input.authMethod,
        authConfig: input.authConfig,
      })
      setRemoteModels(models)

      if (models.length > 0 && !form.getValues('modelName')) {
        const firstModel = models[0]
        if (firstModel) {
          form.setValue('modelName', firstModel.id, { shouldValidate: true })
        }
      }
    } catch (error) {
      setRemoteModels([])
      setConnectionStatus({
        success: false,
        error: error instanceof Error ? error.message : '获取模型列表失败',
      })
    }
  }, [buildConnectionInput, fetchModelsMutation, form])

  const handleAuthConfigChange = useCallback(
    (field: string, value: string) => {
      const current = form.getValues('authConfig') ?? {}
      form.setValue('authConfig', { ...current, [field]: value || undefined }, { shouldDirty: true })
    },
    [form],
  )

  return (
    <div className="space-y-4" data-testid="private-cloud-config-section">
      <div className="space-y-2 sm:col-span-2">
        <Label>端点 URL</Label>
        <Input
          placeholder="https://your-vllm-server:8000/v1"
          {...form.register('endpointUrl')}
          data-testid="endpoint-url-input"
        />
        {form.formState.errors.endpointUrl ? (
          <p className="text-[11px] text-error">
            {form.formState.errors.endpointUrl.message as string}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          OpenAI 兼容的推理端点地址，例如 vLLM、Ollama 或 LocalAI 的服务地址。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>认证方式</Label>
          <Controller
            control={form.control}
            name="authMethod"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                data-testid="auth-method-select"
              >
                {AUTH_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {AUTH_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>超时时间 (ms)</Label>
          <Input
            type="number"
            min={1000}
            max={300000}
            placeholder="120000"
            {...form.register('timeoutMs', { valueAsNumber: true })}
            data-testid="timeout-input"
          />
          {form.formState.errors.timeoutMs ? (
            <p className="text-[11px] text-error">
              {form.formState.errors.timeoutMs.message as string}
            </p>
          ) : null}
        </div>
      </div>

      {authMethod === 'api_key' ? (
        <div className="space-y-2" data-testid="api-key-auth-section">
          <Label>API Key</Label>
          <Input
            type="password"
            placeholder="输入私有云 API Key"
            value={(form.getValues('authConfig')?.apiKey as string) ?? ''}
            onChange={(event) => handleAuthConfigChange('apiKey', event.target.value)}
            data-testid="auth-api-key-input"
          />
          <p className="text-[11px] text-muted-foreground">
            用于私有云端点的认证密钥。
          </p>
        </div>
      ) : null}

      {authMethod === 'mtls' ? (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="mtls-auth-section">
          <div className="space-y-2">
            <Label>证书路径</Label>
            <Input
              placeholder="/path/to/client.crt"
              value={(form.getValues('authConfig')?.certPath as string) ?? ''}
              onChange={(event) => handleAuthConfigChange('certPath', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>密钥路径</Label>
            <Input
              placeholder="/path/to/client.key"
              value={(form.getValues('authConfig')?.keyPath as string) ?? ''}
              onChange={(event) => handleAuthConfigChange('keyPath', event.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!endpointUrl || testConnectionMutation.isPending}
          onClick={handleTestConnection}
          data-testid="test-connection-btn"
        >
          {testConnectionMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlugZap className="mr-1.5 h-3.5 w-3.5" />
          )}
          测试连接
        </Button>

        {connectionStatus?.success ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fetchModelsMutation.isPending}
            onClick={handleFetchModels}
            data-testid="fetch-models-btn"
          >
            {fetchModelsMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            获取模型列表
          </Button>
        ) : null}
      </div>

      {connectionStatus ? (
        <div
          className={
            connectionStatus.success
              ? 'flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400'
              : 'flex items-center gap-2 rounded-lg border border-error/50 bg-error/5 px-3 py-2 text-xs text-error'
          }
          data-testid="connection-status"
        >
          {connectionStatus.success ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>连接成功 — 延迟 {connectionStatus.latencyMs}ms</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{connectionStatus.error}</span>
            </>
          )}
        </div>
      ) : null}

      {remoteModels.length > 0 ? (
        <div className="space-y-2" data-testid="remote-models-section">
          <Label>可用模型</Label>
          <Controller
            control={form.control}
            name="modelName"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                data-testid="remote-model-select"
              >
                <option value="">请选择模型</option>
                {remoteModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}{model.ownedBy ? ` (${model.ownedBy})` : ''}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>
      ) : connectionStatus?.success ? (
        <div className="space-y-2">
          <Label>模型名称</Label>
          <Input
            placeholder="输入模型名称，例如 llama-3-70b"
            {...form.register('modelName')}
            data-testid="manual-model-input"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>模型名称</Label>
          <Input
            placeholder="请先测试连接，或手动输入模型名称"
            {...form.register('modelName')}
          />
        </div>
      )}

      {form.formState.errors.modelName ? (
        <p className="text-[11px] text-error">{form.formState.errors.modelName.message}</p>
      ) : null}
    </div>
  )
}
