import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.unmock('@/shared/lib/supabase')

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  })),
}))

const ORIGINAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ORIGINAL_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const mutableImportMetaEnv = import.meta.env as Record<string, string | undefined>

function setSupabaseEnv({
  url,
  anonKey,
}: {
  url?: string
  anonKey?: string
}) {
  if (url === undefined) {
    delete mutableImportMetaEnv.VITE_SUPABASE_URL
  } else {
    mutableImportMetaEnv.VITE_SUPABASE_URL = url
  }

  if (anonKey === undefined) {
    delete mutableImportMetaEnv.VITE_SUPABASE_ANON_KEY
  } else {
    mutableImportMetaEnv.VITE_SUPABASE_ANON_KEY = anonKey
  }
}

describe('supabase client bootstrap', () => {
  beforeEach(() => {
    setSupabaseEnv({
      url: 'https://test-project.supabase.co',
      anonKey: 'test-anon-key-value',
    })
  })

  afterEach(() => {
    setSupabaseEnv({
      url: ORIGINAL_SUPABASE_URL,
      anonKey: ORIGINAL_SUPABASE_ANON_KEY,
    })
    vi.resetModules()
  })

  it('exports a supabase client instance', async () => {
    const mod = await import('../supabase')
    expect(mod.supabase).toBeDefined()
  })

  it('creates client with PKCE flow type', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const createClientMock = vi.mocked(createClient)

    await import('../supabase')

    expect(createClientMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co',
      'test-anon-key-value',
      expect.objectContaining({
        auth: expect.objectContaining({
          flowType: 'pkce',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        }),
      }),
    )
  })

  it('throws when VITE_SUPABASE_URL is missing', async () => {
    vi.resetModules()
    setSupabaseEnv({ anonKey: 'test-anon-key-value' })

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })

  it('throws when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.resetModules()
    setSupabaseEnv({ url: 'https://test-project.supabase.co' })

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })

  it('throws when both env vars are missing', async () => {
    vi.resetModules()
    setSupabaseEnv({})

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })
})
