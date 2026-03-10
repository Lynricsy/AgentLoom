import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class EvidenceNotFoundException extends DomainException {
  constructor(evidenceId: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-not-found',
      title: 'Evidence Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Evidence record with id '${evidenceId}' was not found.`,
    });
  }
}

export class EvidenceIntegrityException extends DomainException {
  constructor(evidenceId: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-integrity-violation',
      title: 'Evidence Integrity Violation',
      status: HttpStatus.CONFLICT,
      detail: `Content hash verification failed for evidence record '${evidenceId}'.`,
    });
  }
}

export class InvalidEvidencePacketException extends DomainException {
  constructor(detail: string) {
    super({
      type: 'https://agentloom.dev/errors/invalid-evidence-packet',
      title: 'Invalid Evidence Packet',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail,
    });
  }
}
