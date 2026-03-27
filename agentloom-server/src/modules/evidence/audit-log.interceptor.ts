import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, mergeMap } from 'rxjs';

import {
  AUDIT_LOG_CAPTURE_KEY,
  type AuditLogHttpCaptureConfig,
  type AuditLogHttpCaptureContext,
} from './audit-log.capture';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http'>() !== 'http') {
      return next.handle();
    }

    const config = this.reflector.getAllAndOverride<AuditLogHttpCaptureConfig>(
      AUDIT_LOG_CAPTURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      mergeMap(async (response) => {
        const captureContext: AuditLogHttpCaptureContext = {
          request,
          response,
        };
        const record = config.buildRecord(captureContext);

        if (record) {
          try {
            await this.auditLogService.record(record);
          } catch (error) {
            this.logger.warn(
              `Failed to persist audit log for ${record.eventType}: ${error instanceof Error ? error.message : String(error)}`,
              {
                tenantId: record.tenantId,
                resourceType: record.resourceType,
                resourceId: record.resourceId,
              },
            );
          }
        }

        return response;
      }),
    );
  }
}
