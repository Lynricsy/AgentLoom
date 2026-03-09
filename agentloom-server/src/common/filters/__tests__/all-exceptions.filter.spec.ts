import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type {
  HttpArgumentsHost,
  RpcArgumentsHost,
  WsArgumentsHost,
} from '@nestjs/common/interfaces';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { DomainException } from '../../exceptions/domain.exception';
import type {
  FieldError,
  ProblemDetails,
} from '../../types/problem-details.type';
import { AllExceptionsFilter } from '../all-exceptions.filter';

type RequestMock = Pick<FastifyRequest, 'url'>;

interface ReplyMock {
  status(statusCode: number): ReplyMock;
  header(name: string, value: string): ReplyMock;
  send(payload: ProblemDetails): ReplyMock;
}

const loggerErrorSpy = vi
  .spyOn(Logger.prototype, 'error')
  .mockImplementation(() => undefined);

function createReplyMock() {
  const status = vi.fn<ReplyMock['status']>();
  const header = vi.fn<ReplyMock['header']>();
  const send = vi.fn<ReplyMock['send']>();

  const reply: ReplyMock = {
    status,
    header,
    send,
  };

  status.mockReturnValue(reply);
  header.mockReturnValue(reply);
  send.mockReturnValue(reply);

  return {
    reply,
    status,
    header,
    send,
  };
}

function createArgumentsHost(
  request: RequestMock,
  reply: ReplyMock,
): ArgumentsHost {
  const args: [RequestMock, ReplyMock] = [request, reply];
  const httpHost: HttpArgumentsHost = {
    getRequest<T = unknown>(): T {
      return request as T;
    },
    getResponse<T = unknown>(): T {
      return reply as T;
    },
    getNext<T = unknown>(): T {
      return undefined as T;
    },
  };

  return {
    getArgs<T extends unknown[] = unknown[]>(): T {
      return args as unknown as T;
    },
    getArgByIndex<T = unknown>(index: number): T {
      return args[index] as T;
    },
    switchToHttp(): HttpArgumentsHost {
      return httpHost;
    },
    switchToRpc(): RpcArgumentsHost {
      return {
        getData<T = unknown>(): T {
          throw new Error('RPC context is not available in this test');
        },
        getContext<T = unknown>(): T {
          throw new Error('RPC context is not available in this test');
        },
      };
    },
    switchToWs(): WsArgumentsHost {
      return {
        getData<T = unknown>(): T {
          throw new Error('WebSocket context is not available in this test');
        },
        getClient<T = unknown>(): T {
          throw new Error('WebSocket context is not available in this test');
        },
        getPattern(): string {
          throw new Error('WebSocket context is not available in this test');
        },
      };
    },
    getType<TContext extends string = 'http'>(): TContext {
      return 'http' as TContext;
    },
  };
}

function expectProblemResponse(
  reply: ReturnType<typeof createReplyMock>,
  expected: ProblemDetails,
) {
  expect(reply.status).toHaveBeenCalledWith(expected.status);
  expect(reply.header).toHaveBeenCalledWith(
    'Content-Type',
    'application/problem+json',
  );
  expect(reply.send).toHaveBeenCalledWith(expected);
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let request: RequestMock;
  let reply: ReturnType<typeof createReplyMock>;
  let host: ArgumentsHost;

  beforeEach(async () => {
    vi.clearAllMocks();

    request = {
      url: '/v1/test-endpoint',
    };
    reply = createReplyMock();
    host = createArgumentsHost(request, reply.reply);

    const module = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get(AllExceptionsFilter);
  });

  it('将 ZodValidationException 映射为 422 problem details', () => {
    const schema = z.object({
      email: z.email(),
      profile: z.object({
        age: z.number().min(1),
      }),
    });
    const result = schema.safeParse({
      email: 'not-an-email',
      profile: {
        age: 0,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      expect.unreachable('expected schema validation to fail');
    }

    const exception = new ZodValidationException(result.error);

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/validation-error',
      title: 'Validation Error',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: 'Request validation failed',
      instance: request.url,
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('将 DomainException 映射为领域 problem details', () => {
    const errors: FieldError[] = [
      {
        field: 'email',
        message: '邮箱已被占用',
      },
    ];
    const exception = new DomainException({
      type: 'https://agentloom.dev/errors/email-conflict',
      title: 'Email Conflict',
      status: HttpStatus.CONFLICT,
      detail: 'The email address is already registered',
      errors,
    });

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/email-conflict',
      title: 'Email Conflict',
      status: HttpStatus.CONFLICT,
      detail: 'The email address is already registered',
      instance: request.url,
      errors,
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('将字符串 HttpException 响应映射为 detail', () => {
    const exception = new HttpException('Bad payload', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/http-error',
      title: HttpStatus[HttpStatus.BAD_REQUEST],
      status: HttpStatus.BAD_REQUEST,
      detail: 'Bad payload',
      instance: request.url,
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('将带 message 的对象 HttpException 响应转成字符串 detail', () => {
    const exception = new HttpException(
      {
        message: ['email is invalid', 'password is required'],
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/http-error',
      title: HttpStatus[HttpStatus.UNPROCESSABLE_ENTITY],
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: 'email is invalid,password is required',
      instance: request.url,
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('在 HttpException 响应对象缺少 message 时回退到 exception.message', () => {
    const exception = new HttpException(
      {
        error: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/http-error',
      title: HttpStatus[HttpStatus.FORBIDDEN],
      status: HttpStatus.FORBIDDEN,
      detail: exception.message,
      instance: request.url,
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('对未知 HttpStatus 使用 Error 标题并记录 5xx 日志', () => {
    const exception = new HttpException('Upstream timeout', 599);

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/http-error',
      title: 'Error',
      status: 599,
      detail: 'Upstream timeout',
      instance: request.url,
    });
    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[599] Upstream timeout',
      exception.stack,
    );
  });

  it('对未知 Error 返回 500 并记录未处理异常与 5xx 日志', () => {
    const exception = new Error('database connection lost');

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance: request.url,
    });
    expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    expect(loggerErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Unhandled exception',
      exception,
    );
    expect(loggerErrorSpy).toHaveBeenNthCalledWith(
      2,
      '[500] An unexpected error occurred',
      exception.stack,
    );
  });

  it('对非 Error 异常在 5xx 日志中传递 undefined stack', () => {
    const exception = 'catastrophic failure';

    filter.catch(exception, host);

    expectProblemResponse(reply, {
      type: 'https://agentloom.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance: request.url,
    });
    expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    expect(loggerErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Unhandled exception',
      exception,
    );
    expect(loggerErrorSpy).toHaveBeenNthCalledWith(
      2,
      '[500] An unexpected error occurred',
      undefined,
    );
  });
});
