import { createClient } from '@supabase/supabase-js'

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  return import.meta.env[name] ?? process.env[name]
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function parseUrl(value: string | undefined): URL | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLoopbackUrl(url: URL | null): boolean {
  return url != null && LOOPBACK_HOSTS.has(url.hostname)
}

function resolveSupabaseUrl(): string | undefined {
  const configured = readEnv('VITE_SUPABASE_URL')?.trim()

  if (typeof window === 'undefined') {
    return configured
  }

  const currentOrigin = window.location.origin
  const configuredUrl = parseUrl(configured)
  const currentOriginUrl = parseUrl(currentOrigin)

  if (!configured) {
    return currentOrigin
  }

  // 当部署配置里残留 localhost/127.0.0.1，但实际页面是通过公网域名或局域网地址访问时，
  // Supabase 请求必须回退到当前站点 origin，否则浏览器会把认证请求打到访问者自己的 localhost。
  if (isLoopbackUrl(configuredUrl) && !isLoopbackUrl(currentOriginUrl)) {
    return currentOrigin
  }

  return configured
}

const supabaseUrl = resolveSupabaseUrl()
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
