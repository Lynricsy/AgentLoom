import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

// 资源归属无法确认时必须 fail-closed，避免跨租户或不存在的资源被伪装成转换成功。
export class ResourceSourceNotFoundException extends DomainException {
  constructor(resourceType: string, resourceId: string) {
    super({
      type: 'https://agentloom.dev/errors/resource-source-not-found',
      title: '资源不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `资源 ${resourceType}/${resourceId} 不存在或无权访问`,
    });
  }
}
