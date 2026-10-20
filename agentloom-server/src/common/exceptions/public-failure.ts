import { HttpException } from '@nestjs/common';

/**
 * 后台任务（Agent 对话 run、工作流步骤 / 执行）失败信息的对外边界。
 *
 * 这些失败信息会经 REST、Socket、Agent 对外 API 原样返回给调用方，边界与
 * AllExceptionsFilter 对 HTTP 响应的处理一致：
 * - `HttpException`（含 `DomainException`）：message / detail 由平台撰写，可以透传；
 * - `UserFacingError`：模型提供方、Agent 运行时上报的错误，以及平台撰写给用户的
 *   节点失败原因（如回复不符合输出 Schema），可以透传；
 * - 其余异常（数据库、Redis、网络库、编程错误等）的原文可能包含 SQL、参数、内部地址，
 *   一律替换为 `INTERNAL_FAILURE_PUBLIC_MESSAGE`，原文只写服务端日志。
 */
export class UserFacingError extends Error {}

export const INTERNAL_FAILURE_PUBLIC_MESSAGE =
  '服务内部错误，本次执行未能完成，请稍后重试';

export function isPublicFailure(
  error: unknown,
): error is HttpException | UserFacingError {
  return error instanceof HttpException || error instanceof UserFacingError;
}

/** 对外可见的失败信息：可透传的错误取其 message，其余为通用文案。 */
export function toPublicFailureMessage(error: unknown): string {
  return isPublicFailure(error)
    ? error.message
    : INTERNAL_FAILURE_PUBLIC_MESSAGE;
}
