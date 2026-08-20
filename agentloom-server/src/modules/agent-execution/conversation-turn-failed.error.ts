/**
 * 对话单轮失败载体：在抛出运行时错误时保留已经聚合出的可持久化 partial turn。
 */
import type { ConversationTurnResult } from './conversation-turn-values';

export class ConversationTurnFailedError extends Error {
  constructor(
    cause: unknown,
    readonly turnResult: ConversationTurnResult,
  ) {
    super(
      cause instanceof Error ? cause.message : 'Agent conversation turn failed',
    );
    this.name = 'ConversationTurnFailedError';
    if (cause instanceof Error && cause.stack) {
      this.stack = cause.stack;
    }
    this.cause = cause;
  }
}
