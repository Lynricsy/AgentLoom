import ky from 'ky'
import { snakeToCamel, camelToSnake } from '@/shared/utils/caseConverter'
import { supabase } from '@/shared/lib/supabase'
import { useAuthStore } from '@/features/auth/stores/auth.store'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AUTH_TOKEN_KEY = 'auth_token'

function readStoredToken(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const apiClient = ky.create({
  prefixUrl: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  retry: {
    limit: 1,
    statusCodes: [401],
    methods: ['get', 'post', 'put', 'delete', 'patch', 'head'],
  },
  hooks: {
    beforeRequest: [
      (request) => {
        const token = readStoredToken()
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    beforeRetry: [
      async ({ request }) => {
        const { data, error } = await supabase.auth.refreshSession()
        const newToken = data.session?.access_token

        if (error || !newToken) {
          await useAuthStore.getState().signOut()
          if (globalThis.window) {
            globalThis.window.location.href = '/login'
          }
          return
        }

        try {
          globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, newToken)
        } catch {
          /* noop */
        }
        request.headers.set('Authorization', `Bearer ${newToken}`)
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const body = await response.json()
          const converted = snakeToCamel(body)
          return new Response(JSON.stringify(converted), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
        }
      },
    ],
  },
})

export function toSnakeBody<T>(data: T): unknown {
  return camelToSnake(data)
}
