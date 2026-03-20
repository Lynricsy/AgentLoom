import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { supabase } from '@/shared/lib/supabase'

const AUTH_TOKEN_KEY = 'auth_token'

function syncTokenToStorage(token: string | null): void {
  try {
    if (token) {
      globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token)
    } else {
      globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    /* noop */
  }
}

export interface AuthState {
  session: Session | null
  user: User | null
  accessToken: string | undefined
  isLoading: boolean
  isAuthenticated: boolean
}

export interface AuthActions {
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  _handleAuthChange: (event: AuthChangeEvent, session: Session | null) => void
}

function createInitialState(): AuthState {
  return {
    session: null,
    user: null,
    accessToken: undefined,
    isLoading: true,
    isAuthenticated: false,
  }
}

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        initialize: async () => {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession()

            set((state) => {
              state.session = session as Session | null
              state.user = (session?.user as User) ?? null
              state.accessToken = session?.access_token ?? undefined
              state.isAuthenticated = !!session
              state.isLoading = false
            })

            syncTokenToStorage(session?.access_token ?? null)

            const {
              data: { subscription },
            } = supabase.auth.onAuthStateChange((event, session) => {
              get()._handleAuthChange(event, session)
            })

            void subscription
          } catch {
            set((state) => {
              state.isLoading = false
            })
          }
        },

        signOut: async () => {
          await supabase.auth.signOut()
        },

        _handleAuthChange: (event, session) => {
          switch (event) {
            case 'SIGNED_IN':
            case 'TOKEN_REFRESHED': {
              set((state) => {
                state.session = session as Session | null
                state.user = (session?.user as User) ?? null
                state.accessToken = session?.access_token ?? undefined
                state.isAuthenticated = !!session
                state.isLoading = false
              })
              syncTokenToStorage(session?.access_token ?? null)
              break
            }

            case 'SIGNED_OUT': {
              set((state) => {
                state.session = null
                state.user = null
                state.accessToken = undefined
                state.isAuthenticated = false
                state.isLoading = false
              })
              syncTokenToStorage(null)
              break
            }

            default:
              break
          }
        },
      })),
    ),
    { name: 'AuthStore' },
  ),
)

export const useAccessToken = () =>
  useAuthStore((state) => state.accessToken)

export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated)

export const useAuthLoading = () =>
  useAuthStore((state) => state.isLoading)
