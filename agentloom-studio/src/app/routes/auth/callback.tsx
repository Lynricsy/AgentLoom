import { createRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { Spinner } from '@/shared/components/spinner/Spinner'
import { supabase } from '@/shared/lib/supabase'
import { rootRoute } from '../__root'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) {
      window.location.href = '/login'
      return
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          window.location.href = `/login?error=${encodeURIComponent(error.message)}`
        } else {
          void navigate({ to: '/', replace: true })
        }
      })
      .catch(() => {
        window.location.href = '/login'
      })
  }, [navigate])

  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">正在完成登录…</p>
      </div>
    </div>
  )
}

export const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
})
