import { HTTPError } from 'ky'

interface ProblemDetailsLike {
  detail?: unknown
  title?: unknown
}

function parseProblem(data: unknown): ProblemDetailsLike | null {
  if (data && typeof data === 'object') {
    return data as ProblemDetailsLike
  }

  if (typeof data === 'string' && data.trim()) {
    try {
      const parsed: unknown = JSON.parse(data)
      return parsed && typeof parsed === 'object'
        ? (parsed as ProblemDetailsLike)
        : null
    } catch {
      return null
    }
  }

  return null
}

/**
 * 从 RFC 9457 problem 响应中取可读说明。
 * ky 会把错误响应体预解析到 `error.data` 并消费掉 body，因此不能再读 `response.json()`。
 */
export function resolveProblemDetail(error: unknown, fallback: string): string {
  if (error instanceof HTTPError) {
    const problem = parseProblem(error.data)

    if (typeof problem?.detail === 'string' && problem.detail.trim()) {
      return problem.detail
    }

    if (typeof problem?.title === 'string' && problem.title.trim()) {
      return problem.title
    }

    return fallback
  }

  return error instanceof Error && error.message ? error.message : fallback
}
