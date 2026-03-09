import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import { validate as isUuid } from 'uuid';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(
    req: IncomingMessage,
    _res: ServerResponse,
    next: (error?: Error) => void,
  ) {
    const tenantId = this.extractTenantId(req);

    if (tenantId) {
      (req as IncomingMessage & { tenantId: string }).tenantId = tenantId;
    }

    next();
  }

  private extractTenantId(req: IncomingMessage): string | undefined {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;

    const token = authHeader.slice(7);
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return undefined;

      const payload = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString(),
      ) as {
        tenantId?: string;
        tenant_id?: string;
      };

      const tenantId = payload.tenantId ?? payload.tenant_id;
      return tenantId && isUuid(tenantId) ? tenantId : undefined;
    } catch {
      return undefined;
    }
  }
}
