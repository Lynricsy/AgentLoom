import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

export class ConversationNotFoundException extends DomainException {
  constructor(conversationId: string) {
    super({
      type: problemType('conversation-not-found'),
      title: '对话不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `对话 ${conversationId} 不存在`,
    });
  }
}

/** Studio 对话与对外 API 共用：对话已结束（或失败），不能再发送消息或建 run */
export class ConversationEndedException extends DomainException {
  constructor(conversationId: string) {
    super({
      type: problemType('conversation-ended'),
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: `Conversation ${conversationId} has ended`,
    });
  }
}
