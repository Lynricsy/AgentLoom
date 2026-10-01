import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

const ERROR_TYPE_BASE = 'https://agentloom.dev/errors/';

function retryAfterHeader(seconds: number): Record<string, string> {
  return { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) };
}

export class AgentApiKeyInvalidException extends DomainException {
  constructor() {
    super({
      type: `${ERROR_TYPE_BASE}agent-api-key-invalid`,
      title: 'Unauthorized',
      status: HttpStatus.UNAUTHORIZED,
      detail: 'Agent API key is invalid, revoked or expired',
    });
  }
}

export class AgentApiKeyNotFoundException extends DomainException {
  constructor(keyId: string) {
    super({
      type: `${ERROR_TYPE_BASE}agent-api-key-not-found`,
      title: 'Agent API Key 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Agent API Key ${keyId} 不存在或无权访问`,
    });
  }
}

export class AgentApiKeyLimitExceededException extends DomainException {
  constructor(limit: number) {
    super({
      type: `${ERROR_TYPE_BASE}agent-api-key-limit-exceeded`,
      title: 'Agent API Key 数量超限',
      status: HttpStatus.CONFLICT,
      detail: `每个 Agent 最多保留 ${limit} 个未吊销的 API Key`,
    });
  }
}

export class AgentNotPublishedException extends DomainException {
  constructor(agentId: string) {
    super({
      type: `${ERROR_TYPE_BASE}agent-not-published`,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} is not published`,
    });
  }
}

export class AgentApiAgentArchivedException extends DomainException {
  constructor(agentId: string) {
    super({
      type: `${ERROR_TYPE_BASE}agent-archived`,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} is archived`,
    });
  }
}

export class AgentApiConversationNotFoundException extends DomainException {
  constructor(conversationId: string) {
    super({
      type: `${ERROR_TYPE_BASE}agent-api-conversation-not-found`,
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Conversation ${conversationId} not found`,
    });
  }
}

export class AgentApiRunNotFoundException extends DomainException {
  constructor(runId: string) {
    super({
      type: `${ERROR_TYPE_BASE}agent-api-run-not-found`,
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Run ${runId} not found`,
    });
  }
}

export class ConversationEndedException extends DomainException {
  constructor(conversationId: string) {
    super({
      type: `${ERROR_TYPE_BASE}conversation-ended`,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: `Conversation ${conversationId} has ended`,
    });
  }
}

export class ConversationBusyException extends DomainException {
  constructor(activeRunId: string) {
    super({
      type: `${ERROR_TYPE_BASE}conversation-busy`,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: 'Conversation already has an active run',
      extensions: { activeRunId },
    });
  }
}

export class RunNotCancellableException extends DomainException {
  constructor(runId: string) {
    super({
      type: `${ERROR_TYPE_BASE}run-not-cancellable`,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: `Run ${runId} has already finished and cannot be cancelled`,
    });
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  constructor() {
    super({
      type: `${ERROR_TYPE_BASE}idempotency-key-reused`,
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: 'Idempotency-Key was already used with a different request body',
    });
  }
}

export class ConcurrencyLimitExceededException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super({
      type: `${ERROR_TYPE_BASE}concurrency-limit-exceeded`,
      title: 'Too Many Requests',
      status: HttpStatus.TOO_MANY_REQUESTS,
      detail: 'Concurrent run limit of this API key has been reached',
      headers: retryAfterHeader(retryAfterSeconds),
    });
  }
}

export class RateLimitExceededException extends DomainException {
  constructor(retryAfterSeconds: number) {
    super({
      type: `${ERROR_TYPE_BASE}rate-limit-exceeded`,
      title: 'Too Many Requests',
      status: HttpStatus.TOO_MANY_REQUESTS,
      detail: 'Rate limit exceeded, retry later',
      headers: retryAfterHeader(retryAfterSeconds),
    });
  }
}

export class RunEventsExpiredException extends DomainException {
  constructor(runId: string) {
    super({
      type: `${ERROR_TYPE_BASE}run-events-expired`,
      title: 'Gone',
      status: HttpStatus.GONE,
      detail: `Events of run ${runId} are no longer retained; fetch the run instead`,
    });
  }
}
