import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

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

describe('supabase client bootstrap', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-value')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-value')

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })

  it('throws when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co')

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })

  it('throws when both env vars are missing', async () => {
    vi.unstubAllEnvs()
    vi.resetModules()

    await expect(() => import('../supabase')).rejects.toThrow(
      'Missing Supabase environment variables',
    )
  })
})
