import ky from 'ky'
import { snakeToCamel, camelToSnake } from '@/shared/utils/caseConverter'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const apiClient = ky.create({
  prefixUrl: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  hooks: {
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
