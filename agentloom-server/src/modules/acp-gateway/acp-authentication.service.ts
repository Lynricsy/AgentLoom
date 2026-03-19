import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { MfaRequiredException } from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import type { AcpAuthContext } from './acp-types';

@Injectable()
export class AcpAuthenticationService {
  private readonly jwtSecret: string;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(TokenBlacklistService)
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    this.jwtSecret = this.configService.get<string>('APP_JWT_SECRET')!;
  }

  async authenticate(token: string): Promise<AcpAuthContext> {
    if (await this.tokenBlacklistService.isBlacklisted(token)) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/token-revoked',
        title: 'Unauthorized',
        status: 401,
        detail: 'Token has been revoked',
      });
    }

    try {
      const verified = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });

      if (!this.isJwtPayloadObject(verified)) {
        throw this.createInvalidTokenException('Token payload is malformed');
      }

      if (this.isMfaPendingPayload(verified)) {
        throw new MfaRequiredException();
      }

      const payload = this.normalizePayload(verified);

      return {
        userId: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        tenantRole: payload.tenantRole,
        orgId: payload.orgId,
        authMethod: 'jwt',
      };
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/token-expired',
          title: 'Unauthorized',
          status: 401,
          detail: 'Token has expired',
        });
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/token-invalid',
        title: 'Unauthorized',
        status: 401,
        detail: 'Token signature is invalid or token is malformed',
      });
    }
  }

  private isJwtPayloadObject(
    payload: string | jwt.JwtPayload,
  ): payload is jwt.JwtPayload {
    return typeof payload !== 'string';
  }

  private normalizePayload(payload: jwt.JwtPayload): JwtPayload {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      (typeof payload.aud !== 'string' && !Array.isArray(payload.aud)) ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      throw this.createInvalidTokenException(
        'Token payload is missing required claims',
      );
    }

    return {
      ...payload,
      sub: payload.sub,
      email: payload.email,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
      orgId: this.readStringClaim(payload, 'orgId', 'org_id'),
      org_id: this.readStringClaim(payload, 'org_id', 'orgId'),
      tenantId: this.readStringClaim(payload, 'tenantId', 'tenant_id'),
      tenantRole: this.readStringClaim(payload, 'tenantRole', 'tenant_role'),
    };
  }

  private isMfaPendingPayload(payload: jwt.JwtPayload): boolean {
    return payload.type === 'mfa_pending';
  }

  private readStringClaim(
    payload: jwt.JwtPayload,
    ...claimNames: string[]
  ): string | undefined {
    for (const claimName of claimNames) {
      const value = payload[claimName];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    return undefined;
  }

  private createInvalidTokenException(detail: string): DomainException {
    return new DomainException({
      type: 'https://agentloom.dev/errors/token-invalid',
      title: 'Unauthorized',
      status: 401,
      detail,
    });
  }
}
