import { memo, useCallback, type ChangeEvent } from 'react'
import { Globe, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Separator } from '@/shared/ui/separator'
import { Switch } from '@/shared/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]
type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'

interface KeyValuePair {
  key: string
  value: string
}

interface HttpToolConfig {
  url: string
  method: HttpMethod
  headers: KeyValuePair[]
  queryParams: KeyValuePair[]
  body: string
  authType: AuthType
  authConfig: Record<string, string>
  timeout: number
  failOnHttpError: boolean
}

interface HttpToolConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

function isKeyValueArray(v: unknown): v is KeyValuePair[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'key' in item &&
        'value' in item,
    )
  )
}

function parseHttpToolConfig(config: Record<string, unknown>): HttpToolConfig {
  const method = config.method
  const authType = config.authType
  const authConfig = config.authConfig
  const timeout = config.timeout

  return {
    url: typeof config.url === 'string' ? config.url : '',
    method:
      typeof method === 'string' && HTTP_METHODS.includes(method as HttpMethod)
        ? (method as HttpMethod)
        : 'GET',
    headers: isKeyValueArray(config.headers) ? config.headers : [],
    queryParams: isKeyValueArray(config.queryParams) ? config.queryParams : [],
    body: typeof config.body === 'string' ? config.body : '',
    authType:
      typeof authType === 'string' &&
      ['none', 'bearer', 'basic', 'api-key'].includes(authType)
        ? (authType as AuthType)
        : 'none',
    authConfig:
      typeof authConfig === 'object' && authConfig !== null
        ? (authConfig as Record<string, string>)
        : {},
    timeout: typeof timeout === 'number' && timeout > 0 ? timeout : 30,
    // 默认 true：与 server 端 http-node executor 的 `!== false` 口径完全一致，
    // 非 2xx 必须让节点失败；只有显式 false 才是「探测型」请求。
    failOnHttpError: config.failOnHttpError !== false,
  }
}

const METHOD_BADGE_COLORS: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-info/15 text-info',
  PUT: 'bg-warning/15 text-warning',
  PATCH: 'bg-node-tool/15 text-node-tool',
  DELETE: 'bg-error/15 text-error',
}

// -- sub-components -----------------------------------------------------------

interface KeyValueListProps {
  label: string
  items: KeyValuePair[]
  keyPlaceholder?: string
  valuePlaceholder?: string
  onChange: (items: KeyValuePair[]) => void
}

const KeyValueList = memo(function KeyValueList({
  label,
  items,
  keyPlaceholder = '键',
  valuePlaceholder = '值',
  onChange,
}: KeyValueListProps) {
  const handleAdd = useCallback(() => {
    onChange([...items, { key: '', value: '' }])
  }, [items, onChange])

  const handleRemove = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index))
    },
    [items, onChange],
  )

  const handleChange = useCallback(
    (index: number, field: 'key' | 'value', value: string) => {
      const next = items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      )
      onChange(next)
    },
    [items, onChange],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted">暂无条目</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={item.key}
                onChange={(e) => handleChange(index, 'key', e.target.value)}
                placeholder={keyPlaceholder}
                className="h-8 w-[40%] text-xs"
              />
              <Input
                value={item.value}
                onChange={(e) => handleChange(index, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="h-8 min-w-0 flex-1 text-xs"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={`删除${label}第 ${index + 1} 项`}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// -- main component -----------------------------------------------------------

export const HttpToolConfigPanel = memo(function HttpToolConfigPanel({
  config,
  onApply,
  onValidationChange,
}: HttpToolConfigPanelProps) {
  const parsed = parseHttpToolConfig(config)

  const applyPatch = useCallback(
    (patch: Partial<HttpToolConfig>) => {
      const next = { ...parseHttpToolConfig(config), ...patch }
      const hasErrors = !next.url
      onValidationChange?.(hasErrors)
      onApply({ config: next })
    },
    [config, onApply, onValidationChange],
  )

  const handleMethod = useCallback(
    (value: string) => {
      applyPatch({ method: value as HttpMethod })
    },
    [applyPatch],
  )

  const handleUrl = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ url: e.target.value })
    },
    [applyPatch],
  )

  const handleHeaders = useCallback(
    (headers: KeyValuePair[]) => {
      applyPatch({ headers })
    },
    [applyPatch],
  )

  const handleQueryParams = useCallback(
    (queryParams: KeyValuePair[]) => {
      applyPatch({ queryParams })
    },
    [applyPatch],
  )

  const handleBody = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyPatch({ body: e.target.value })
    },
    [applyPatch],
  )

  const handleAuthType = useCallback(
    (value: string) => {
      applyPatch({ authType: value as AuthType, authConfig: {} })
    },
    [applyPatch],
  )

  const handleAuthField = useCallback(
    (field: string, value: string) => {
      applyPatch({
        authConfig: { ...parseHttpToolConfig(config).authConfig, [field]: value },
      })
    },
    [applyPatch, config],
  )

  const handleTimeout = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10)
      applyPatch({ timeout: Number.isNaN(v) || v <= 0 ? 30 : v })
    },
    [applyPatch],
  )

  const handleFailOnHttpError = useCallback(
    (checked: boolean) => {
      applyPatch({ failOnHttpError: checked })
    },
    [applyPatch],
  )

  const methodColor =
    METHOD_BADGE_COLORS[parsed.method] ?? 'bg-muted text-muted-foreground'

  return (
    <div className="space-y-5 px-4 py-4" data-testid="http-tool-config-panel">
      {/* 方法 + URL */}
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-type-tool" />
        <span className="text-xs font-medium text-foreground">HTTP 请求</span>
      </div>

      <div className="flex items-start gap-2">
        <div className="flex w-[104px] shrink-0 flex-col gap-1.5">
          <label
            htmlFor="http-method"
            className="text-xs font-medium text-foreground"
          >
            Method
          </label>
          <Select value={parsed.method} onValueChange={handleMethod}>
            <SelectTrigger
              id="http-method"
              aria-label="Method"
              className={`font-bold ${methodColor}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor="http-url"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
          >
            URL
            <span className="text-error">*</span>
          </label>
          <Input
            id="http-url"
            value={parsed.url}
            onChange={handleUrl}
            placeholder="https://api.example.com/endpoint"
          />
        </div>
      </div>

      <Separator />

      {/* Headers */}
      <KeyValueList
        label="请求头"
        items={parsed.headers}
        keyPlaceholder="Header 名"
        valuePlaceholder="值"
        onChange={handleHeaders}
      />

      <Separator />

      {/* Query Params */}
      <KeyValueList
        label="Query 参数"
        items={parsed.queryParams}
        keyPlaceholder="参数名"
        valuePlaceholder="值"
        onChange={handleQueryParams}
      />

      <Separator />

      {/* Request Body */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="http-body" className="text-xs font-medium text-foreground">
          请求体
        </label>
        <Textarea
          id="http-body"
          value={parsed.body}
          onChange={handleBody}
          rows={5}
          placeholder='{"key": "value"}'
          className="font-mono"
        />
        <p className="text-xs text-muted">
          JSON 格式的请求体，适用于 POST / PUT / PATCH 请求
        </p>
      </div>

      <Separator />

      {/* Auth */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="http-auth-type"
            className="text-xs font-medium text-foreground"
          >
            认证方式
          </label>
          <Select value={parsed.authType} onValueChange={handleAuthType}>
            <SelectTrigger id="http-auth-type" aria-label="认证方式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">无认证</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
              <SelectItem value="api-key">API Key</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {parsed.authType === 'bearer' && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="http-auth-token"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
            >
              Token
              <span className="text-error">*</span>
            </label>
            <Input
              id="http-auth-token"
              type="password"
              value={parsed.authConfig.token ?? ''}
              onChange={(e) => handleAuthField('token', e.target.value)}
              placeholder="Bearer token"
            />
          </div>
        )}

        {parsed.authType === 'basic' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="http-auth-username"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
              >
                用户名
                <span className="text-error">*</span>
              </label>
              <Input
                id="http-auth-username"
                value={parsed.authConfig.username ?? ''}
                onChange={(e) => handleAuthField('username', e.target.value)}
                placeholder="用户名"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="http-auth-password"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
              >
                密码
                <span className="text-error">*</span>
              </label>
              <Input
                id="http-auth-password"
                type="password"
                value={parsed.authConfig.password ?? ''}
                onChange={(e) => handleAuthField('password', e.target.value)}
                placeholder="密码"
              />
            </div>
          </>
        )}

        {parsed.authType === 'api-key' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="http-auth-key-name"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
              >
                Key 名称
                <span className="text-error">*</span>
              </label>
              <Input
                id="http-auth-key-name"
                value={parsed.authConfig.keyName ?? ''}
                onChange={(e) => handleAuthField('keyName', e.target.value)}
                placeholder="例：X-API-Key"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="http-auth-key-value"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
              >
                Key 值
                <span className="text-error">*</span>
              </label>
              <Input
                id="http-auth-key-value"
                type="password"
                value={parsed.authConfig.keyValue ?? ''}
                onChange={(e) => handleAuthField('keyValue', e.target.value)}
                placeholder="API Key"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="http-auth-key-location"
                className="text-xs font-medium text-foreground"
              >
                传递位置
              </label>
              <Select
                value={parsed.authConfig.location ?? 'header'}
                onValueChange={(value) => handleAuthField('location', value)}
              >
                <SelectTrigger id="http-auth-key-location" aria-label="传递位置">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="header">请求头</SelectItem>
                  <SelectItem value="query">Query 参数</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      <Separator />

      {/* Timeout */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="http-timeout"
          className="text-xs font-medium text-foreground"
        >
          超时时间（秒）
        </label>
        <Input
          id="http-timeout"
          type="number"
          min={1}
          max={300}
          value={parsed.timeout}
          onChange={handleTimeout}
          className="w-24"
        />
        <p className="text-xs text-muted">
          请求超时时间，默认 30 秒，最长 300 秒
        </p>
      </div>

      {/* 失败语义：非 2xx 是否判定节点失败 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="http-fail-on-error"
            className="text-xs font-medium text-foreground"
          >
            非 2xx 视为失败
          </label>
          <Switch
            id="http-fail-on-error"
            aria-label="非 2xx 视为失败"
            checked={parsed.failOnHttpError}
            onCheckedChange={handleFailOnHttpError}
          />
        </div>
        <p className="text-xs text-muted">
          默认开启：HTTP 响应状态码非 2xx 时该节点判定为失败。关闭后非 2xx 也视为成功（探测型请求）。
        </p>
      </div>
    </div>
  )
})
