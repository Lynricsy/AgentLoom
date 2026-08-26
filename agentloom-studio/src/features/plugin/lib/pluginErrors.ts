import { HTTPError } from 'ky'

interface ErrorBody {
  detail?: string
  message?: string | string[]
  title?: string
}

/**
 * 取服务端错误文案。
 *
 * 升级/卸载的 409 语义（未安装、listing 换绑了别的插件、已是最新）只在
 * problem+json 的 detail 里说得清，落回「操作失败」等于把诊断信息丢掉。
 * 服务端错误体在 problem-details 与 Nest 默认体之间不统一，两种都读一遍。
 */
export async function resolvePluginErrorMessage(
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
