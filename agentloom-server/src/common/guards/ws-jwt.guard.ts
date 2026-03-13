import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import type { JwtPayload } from './auth.guard';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {
    this.jwtSecret = this.configService.get<string>('APP_JWT_SECRET')!;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();

    if (client.data?.user) {
      return true;
    }

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Authentication token is missing');
    }

    if (await this.tokenBlacklist.isBlacklisted(token)) {
      throw new WsException('Token has been revoked');
    }

    try {
      const verified = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });

      if (typeof verified === 'string') {
        throw new WsException('Token payload is malformed');
      }

      if (verified.type === 'mfa_pending') {
        throw new WsException('MFA verification required');
      }

      const payload = this.normalizePayload(verified);
      client.data = { ...client.data, user: payload };
      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new WsException('Token has expired');
      }

      this.logger.warn(`WebSocket auth failed: ${(error as Error).message}`);
      throw new WsException('Token is invalid');
    }
  }

  private extractToken(client: Socket): string | undefined {
    return (
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '')
    );
  }

  private normalizePayload(payload: jwt.JwtPayload): JwtPayload {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      (typeof payload.aud !== 'string' && !Array.isArray(payload.aud)) ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      throw new WsException('Token payload is missing required claims');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
      tenantId: this.readStringClaim(payload, 'tenantId', 'tenant_id'),
      tenantRole: this.readStringClaim(payload, 'tenantRole', 'tenant_role'),
    };
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
}
