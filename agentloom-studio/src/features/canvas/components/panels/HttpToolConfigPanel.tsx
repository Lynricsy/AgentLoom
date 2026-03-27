import { memo, useCallback, type ChangeEvent } from 'react'
import { Globe, Plus, Trash2 } from 'lucide-react'

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
  }
}

const METHOD_BADGE_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PUT: 'bg-orange-500/15 text-orange-400',
  PATCH: 'bg-yellow-500/15 text-yellow-400',
  DELETE: 'bg-red-500/15 text-red-400',
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
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
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
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">暂无条目</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                type="text"
                value={item.key}
                onChange={(e) => handleChange(index, 'key', e.target.value)}
                placeholder={keyPlaceholder}
                className="w-[40%] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={item.value}
                onChange={(e) => handleChange(index, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-error/10 hover:text-error transition-colors"
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
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyPatch({ method: e.target.value as HttpMethod })
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
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyPatch({ authType: e.target.value as AuthType, authConfig: {} })
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
        <div className="w-[100px] shrink-0">
          <label htmlFor="http-method" className="mb-1 block text-xs font-medium text-foreground">
            Method
          </label>
          <select
            id="http-method"
            value={parsed.method}
            onChange={handleMethod}
            className={`w-full rounded-md border border-border px-2 py-2 text-xs font-bold ${methodColor}`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="http-url" className="mb-1 block text-xs font-medium text-foreground">
            URL <span className="text-error">*</span>
          </label>
          <input
            id="http-url"
            type="text"
            value={parsed.url}
            onChange={handleUrl}
            placeholder="https://api.example.com/endpoint"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <hr className="border-border" />

      {/* Headers */}
      <KeyValueList
        label="Headers"
        items={parsed.headers}
        keyPlaceholder="Header 名"
        valuePlaceholder="值"
        onChange={handleHeaders}
      />

      <hr className="border-border" />

      {/* Query Params */}
      <KeyValueList
        label="Query 参数"
        items={parsed.queryParams}
        keyPlaceholder="参数名"
        valuePlaceholder="值"
        onChange={handleQueryParams}
      />

      <hr className="border-border" />

      {/* Request Body */}
      <div>
        <label
          htmlFor="http-body"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          请求体
        </label>
        <textarea
          id="http-body"
          value={parsed.body}
          onChange={handleBody}
          rows={5}
          placeholder='{"key": "value"}'
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          JSON 格式的请求体，适用于 POST / PUT / PATCH 请求
        </p>
      </div>

      <hr className="border-border" />

      {/* Auth */}
      <div className="space-y-3">
        <div>
          <label
            htmlFor="http-auth-type"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            认证方式
          </label>
          <select
            id="http-auth-type"
            value={parsed.authType}
            onChange={handleAuthType}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="none">无认证</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="api-key">API Key</option>
          </select>
        </div>

        {parsed.authType === 'bearer' && (
          <div>
            <label
              htmlFor="http-auth-token"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Token <span className="text-error">*</span>
            </label>
            <input
              id="http-auth-token"
              type="password"
              value={parsed.authConfig.token ?? ''}
              onChange={(e) => handleAuthField('token', e.target.value)}
              placeholder="Bearer token"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        {parsed.authType === 'basic' && (
          <>
            <div>
              <label
                htmlFor="http-auth-username"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                用户名 <span className="text-error">*</span>
              </label>
              <input
                id="http-auth-username"
                type="text"
                value={parsed.authConfig.username ?? ''}
                onChange={(e) => handleAuthField('username', e.target.value)}
                placeholder="用户名"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="http-auth-password"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                密码 <span className="text-error">*</span>
              </label>
              <input
                id="http-auth-password"
                type="password"
                value={parsed.authConfig.password ?? ''}
                onChange={(e) => handleAuthField('password', e.target.value)}
                placeholder="密码"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {parsed.authType === 'api-key' && (
          <>
            <div>
              <label
                htmlFor="http-auth-key-name"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                Key 名称 <span className="text-error">*</span>
              </label>
              <input
                id="http-auth-key-name"
                type="text"
                value={parsed.authConfig.keyName ?? ''}
                onChange={(e) => handleAuthField('keyName', e.target.value)}
                placeholder="例：X-API-Key"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="http-auth-key-value"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                Key 值 <span className="text-error">*</span>
              </label>
              <input
                id="http-auth-key-value"
                type="password"
                value={parsed.authConfig.keyValue ?? ''}
                onChange={(e) => handleAuthField('keyValue', e.target.value)}
                placeholder="API Key"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="http-auth-key-location"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                传递位置
              </label>
              <select
                id="http-auth-key-location"
                value={parsed.authConfig.location ?? 'header'}
                onChange={(e) => handleAuthField('location', e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="header">Header</option>
                <option value="query">Query 参数</option>
              </select>
            </div>
          </>
        )}
      </div>

      <hr className="border-border" />

      {/* Timeout */}
      <div>
        <label
          htmlFor="http-timeout"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          超时时间（秒）
        </label>
        <input
          id="http-timeout"
          type="number"
          min={1}
          max={300}
          value={parsed.timeout}
          onChange={handleTimeout}
          className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          请求超时时间，默认 30 秒，最长 300 秒
        </p>
      </div>
    </div>
  )
})
