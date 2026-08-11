import { HTTPError } from 'ky'

/**
 * 构造一个能被 `resolveOrganizationErrorMessage` 正确识别的 ky HTTPError 替身，
 * 供组织相关组件测试模拟服务端错误响应。
 *
 * 为什么不用真实的 `new HTTPError(new Response(...), new Request(...), ...)`：
 * 真实 HTTPError 持有 undici 的 Request/Response 实例，对象图庞大且含循环引用。
 * 这种错误作为 rejection 冒到 vitest 的上报路径时会被 serialize()，白白付出深度遍历
 * 的代价，出错时的诊断输出也会被无关内部字段淹没。替身只带断言真正依赖的字段。
 *
 * 这里保留组件真正读取的两样东西：
 * 1. `instanceof HTTPError` 成立（`organizationErrors.ts` 靠它分流，不成立就会退回
 *    `error.message`，服务端文案断言会失败）——靠改原型链实现，不调用真实构造函数，
 *    因此不携带任何 Request/Response；
 * 2. `error.response.json()` 返回服务端错误体（`detail`/`message`/`title` 由调用方给）。
 * `status` / `ok` 仅为让替身在调试时可读，组件当前不读它们。
 */
export function makeHttpError(status: number, body: unknown): HTTPError {
  const error = new Error(`HTTP ${status}`)
  Object.setPrototypeOf(error, HTTPError.prototype)

  return Object.assign(error, {
    name: 'HTTPError',
    response: {
      status,
      ok: false,
      json: async () => body,
    },
  }) as unknown as HTTPError
}
