import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { DomainException } from '../exceptions/domain.exception';
import { problemType } from '../exceptions/problem-type';
import type { ProblemDetails } from '../types/problem-details.type';

const INVALID_TEXT_REPRESENTATION = '22P02';
const POSTGRES_ERROR_CAUSE_MAX_DEPTH = 4;

/**
 * 在异常及其 cause 链（Drizzle 把驱动错误包在 DrizzleQueryError.cause）中
 * 查找 uuid 文本转换失败的 Postgres 错误。
 *
 * 只认 uuid：路径或查询参数里的非法 id 等价于「资源不存在」；其他类型的
 * 22P02（integer/json/enum 等）多为服务端未校验的数据，保持 500 以免掩盖缺陷。
 */
function isInvalidUuidTextError(error: unknown): boolean {
  let current: unknown = error;

  for (
    let depth = 0;
    depth <= POSTGRES_ERROR_CAUSE_MAX_DEPTH &&
    typeof current === 'object' &&
    current !== null;
    depth += 1
  ) {
    const record = current as Record<string, unknown>;
    if (record.code === INVALID_TEXT_REPRESENTATION) {
      return (
        record.routine === 'string_to_uuid' ||
        (typeof record.message === 'string' &&
          record.message.includes('type uuid'))
      );
    }
    current = record.cause;
  }

  return false;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const problem = this.buildProblemDetails(exception, request.url);

    if (problem.status >= 500) {
      this.logger.error(
        `[${problem.status}] ${problem.detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    reply.status(problem.status);

    if (exception instanceof DomainException && exception.headers) {
      for (const [name, value] of Object.entries(exception.headers)) {
        reply.header(name, value);
      }
    }

    reply.header('Content-Type', 'application/problem+json').send(problem);
  }

  private buildProblemDetails(
    exception: unknown,
    instance: string,
  ): ProblemDetails {
    // 服务内手写 `Schema.parse()` 抛出的裸 ZodError 同样是输入不合法，
    // 与 ZodValidationPipe 输出同形的 422，而不是 500。
    if (
      exception instanceof ZodValidationException ||
      exception instanceof z.ZodError
    ) {
      const zodError =
        exception instanceof z.ZodError
          ? exception
          : (exception.getZodError() as z.ZodError | undefined);
      return {
        type: problemType('validation-error'),
        title: 'Validation Error',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'Request validation failed',
        instance,
        errors: zodError?.issues?.map((issue: z.ZodIssue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })) ?? [{ field: 'unknown', message: exception.message }],
      };
    }

    if (exception instanceof DomainException) {
      return this.withExtensions(
        {
          type: exception.type,
          title: exception.message,
          status: exception.getStatus(),
          detail: exception.detail,
          instance,
          ...(exception.errors && { errors: exception.errors }),
        },
        exception.extensions,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : ((response as Record<string, unknown>).message?.toString() ??
            exception.message);

      return {
        type: problemType('http-error'),
        title: HttpStatus[status] ?? 'Error',
        status,
        detail,
        instance,
      };
    }

    if (isInvalidUuidTextError(exception)) {
      return {
        type: problemType('not-found'),
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: '资源不存在：标识符不是合法的 UUID',
        instance,
      };
    }

    this.logger.error('Unhandled exception', exception);

    return {
      type: problemType('internal-server-error'),
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance,
    };
  }

  private withExtensions(
    problem: ProblemDetails,
    extensions?: Record<string, unknown>,
  ): ProblemDetails {
    if (!extensions) {
      return problem;
    }

    const enrichedProblem: ProblemDetails = {
      ...problem,
    };

    for (const [key, value] of Object.entries(extensions)) {
      if (key in enrichedProblem) {
        continue;
      }

      enrichedProblem[key] = value;
    }

    return enrichedProblem;
  }
}
