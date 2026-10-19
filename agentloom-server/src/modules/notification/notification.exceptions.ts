import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class NotificationNotFoundException extends DomainException {
  constructor(notificationId: string) {
    super({
      type: 'https://agentloom.dev/errors/notification-not-found',
      title: '通知不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `未找到 ID 为 ${notificationId} 的通知`,
    });
  }
}
