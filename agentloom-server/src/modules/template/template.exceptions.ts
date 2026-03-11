import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class TemplateNotFoundException extends DomainException {
  constructor(slug: string) {
    super({
      type: 'https://agentloom.dev/errors/template-not-found',
      title: 'Template Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Template with slug '${slug}' was not found.`,
    });
  }
}
