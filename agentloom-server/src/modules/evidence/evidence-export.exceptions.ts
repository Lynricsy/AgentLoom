import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';

export class EvidenceExportNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-not-found',
      title: 'Evidence Export Job Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Evidence export job ${id} does not exist or is not accessible.`,
    });
  }
}

export class EvidenceExportArtifactNotReadyException extends DomainException {
  constructor(id: string, status: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-artifact-not-ready',
      title: 'Evidence Export Artifact Not Ready',
      status: HttpStatus.CONFLICT,
      detail: `Evidence export job ${id} is in status ${status} and does not have a downloadable artifact yet.`,
      extensions: {
        status,
      },
    });
  }
}

export class EvidenceExportExpiredException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-expired',
      title: 'Evidence Export Expired',
      status: HttpStatus.GONE,
      detail: `Evidence export job ${id} has expired and can no longer be downloaded.`,
    });
  }
}

export class EvidenceExportArtifactNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-artifact-not-found',
      title: 'Evidence Export Artifact Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: `Evidence export job ${id} does not have a stored artifact available for download.`,
    });
  }
}

export class EvidenceExportArtifactUnavailableException extends DomainException {
  constructor(id: string, reason: string) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-artifact-unavailable',
      title: 'Evidence Export Artifact Unavailable',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      detail: `Evidence export job ${id} is temporarily unavailable for download: ${reason}`,
    });
  }
}

export class EvidenceExportWorkloadLimitExceededException extends DomainException {
  constructor(limit: number, actual: number) {
    super({
      type: 'https://agentloom.dev/errors/evidence-export-workload-limit-exceeded',
      title: 'Evidence Export Workload Limit Exceeded',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: `Evidence export request matched ${actual} executions, which exceeds the maximum allowed workload of ${limit}.`,
      extensions: {
        limit,
        actual,
      },
    });
  }
}
