import { HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';
import {
  AgentApiAgentArchivedException,
  AgentApiConversationNotFoundException,
  AgentApiRunNotFoundException,
  AgentApiValidationException,
  AgentNotPublishedException,
  ConcurrencyLimitExceededException,
  ConversationBusyException,
  IdempotencyKeyReusedException,
  RateLimitExceededException,
  RunNotCancellableException,
} from '../agent-api/agent-api.exceptions';
import { ConversationEndedException } from '../agent-conversation/agent-conversation.exceptions';
import {
  A2A_ERRORS,
  JSON_RPC_ERRORS,
  type JsonRpcErrorObject,
} from './a2a.types';

/** 以 JSON-RPC error 返回给 A2A 客户端的错误 */
export class A2aRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'A2aRpcError';
  }
}

/** Agent Card 所指的 Agent 不存在或未发布（REST，problem+json 404） */
export class A2aAgentNotFoundException extends DomainException {
  constructor(agentDefinitionId: string) {
    super({
      type: problemType('a2a/agent-not-found'),
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent ${agentDefinitionId} does not exist or is not published`,
    });
  }
}

export interface A2aRpcErrorMapping {
  error: JsonRpcErrorObject;
  /** JSON-RPC 错误默认以 HTTP 200 返回；限流与并发超限用 429 */
  httpStatus: number;
  headers?: Record<string, string>;
  /** 非预期错误，调用方需要记录日志 */
  unexpected: boolean;
}

/** 把服务层异常映射为 A2A / JSON-RPC 错误 */
export function toRpcError(error: unknown): A2aRpcErrorMapping {
  const ok = HttpStatus.OK;

  if (error instanceof A2aRpcError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.data !== undefined ? { data: error.data } : {}),
      },
      httpStatus: ok,
      unexpected: false,
    };
  }

  if (error instanceof ZodError) {
    return {
      error: {
        code: JSON_RPC_ERRORS.InvalidParams,
        message: 'Invalid params',
        data: [
          {
            '@type': 'type.googleapis.com/google.rpc.BadRequest',
            fieldViolations: error.issues.map((issue) => ({
              field: issue.path.map(String).join('.'),
              description: issue.message,
            })),
          },
        ],
      },
      httpStatus: ok,
      unexpected: false,
    };
  }

  if (
    error instanceof ConcurrencyLimitExceededException ||
    error instanceof RateLimitExceededException
  ) {
    return {
      error: { code: A2A_ERRORS.UnsupportedOperation, message: error.detail },
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      ...(error.headers ? { headers: error.headers } : {}),
      unexpected: false,
    };
  }

  const known: Array<[new (...args: never[]) => DomainException, number]> = [
    [AgentApiRunNotFoundException, A2A_ERRORS.TaskNotFound],
    [RunNotCancellableException, A2A_ERRORS.TaskNotCancelable],
    [AgentNotPublishedException, A2A_ERRORS.UnsupportedOperation],
    [AgentApiAgentArchivedException, A2A_ERRORS.UnsupportedOperation],
    [ConversationEndedException, A2A_ERRORS.UnsupportedOperation],
    [AgentApiConversationNotFoundException, JSON_RPC_ERRORS.InvalidParams],
    [AgentApiValidationException, JSON_RPC_ERRORS.InvalidParams],
    [IdempotencyKeyReusedException, JSON_RPC_ERRORS.InvalidParams],
  ];

  if (error instanceof ConversationBusyException) {
    return {
      error: {
        code: A2A_ERRORS.UnsupportedOperation,
        message: 'context has an active task',
        ...(error.extensions ? { data: error.extensions } : {}),
      },
      httpStatus: ok,
      unexpected: false,
    };
  }

  for (const [exceptionClass, code] of known) {
    if (error instanceof exceptionClass) {
      return {
        error: { code, message: error.detail },
        httpStatus: ok,
        unexpected: false,
      };
    }
  }

  // 其余领域异常（维护模式、派发失败等）是服务端可预期的拒绝，保留 type 方便排查
  if (error instanceof DomainException) {
    return {
      error: {
        code: JSON_RPC_ERRORS.InternalError,
        message: error.detail,
        data: { type: error.type },
      },
      httpStatus: ok,
      ...(error.headers ? { headers: error.headers } : {}),
      unexpected: false,
    };
  }

  return {
    error: { code: JSON_RPC_ERRORS.InternalError, message: 'Internal error' },
    httpStatus: ok,
    unexpected: true,
  };
}
