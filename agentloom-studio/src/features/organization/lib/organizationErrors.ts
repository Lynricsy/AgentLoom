import { HTTPError } from 'ky'

interface ErrorBody {
  detail?: string
  message?: string | string[]
  title?: string
}

/** 服务端错误响应在 problem-details 与 Nest 默认体之间不统一，两种都读一遍 */
export async function resolveOrganizationErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!(error instanceof HTTPError)) {
    return error instanceof Error && error.message ? error.message : fallback
  }

  try {
    const body = await error.response.json<ErrorBody>()

    if (typeof body.detail === 'string' && body.detail) {
      return body.detail
    }

    if (Array.isArray(body.message)) {
      const joined = body.message.filter(Boolean).join('；')
      if (joined) {
        return joined
      }
    } else if (typeof body.message === 'string' && body.message) {
      return body.message
    }

    if (typeof body.title === 'string' && body.title) {
      return body.title
    }

    return fallback
  } catch {
    return fallback
  }
}
