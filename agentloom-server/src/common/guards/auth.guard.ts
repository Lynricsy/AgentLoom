import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MfaRequiredException } from '../exceptions/auth.exceptions';
import { DomainException } from '../exceptions/domain.exception';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { UserIdentityResolverService } from '../services/user-identity-resolver.service';
import { PlatformApiTokenService } from '../../modules/platform-api-token/platform-api-token.service';

export type AuthMethod = 'jwt' | 'api_key';

export interface JwtPayload {
  sub: string;
  supabaseUserId?: string;
  email: string;
  aud: string | string[];
  exp: number;
  iat: number;
  orgId?: string;
  org_id?: string;
  tenantId?: string;
  tenantRole?: string;
}

type RequestWithAuthContext = FastifyRequest & {
  user: JwtPayload;
  tenantId?: string;
  authMethod: AuthMethod;
  apiKeyPrefix?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly jwtSecret: string;

  private platformApiTokenService?: PlatformApiTokenService;
  private userIdentityResolver?: UserIdentityResolverService;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.jwtSecret = this.configService.get<string>('APP_JWT_SECRET')!;
  }

  private getPlatformApiTokenService(): PlatformApiTokenService {
    if (!this.platformApiTokenService) {
      this.platformApiTokenService = this.moduleRef.get(
        PlatformApiTokenService,
        { strict: false },
      );
    }
    return this.platformApiTokenService;
  }

  private getUserIdentityResolver(): UserIdentityResolverService {
    if (!this.userIdentityResolver) {
      this.userIdentityResolver = this.moduleRef.get(
        UserIdentityResolverService,
        { strict: false },
      );
    }
    return this.userIdentityResolver;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const bearerToken = this.extractTokenFromHeader(request);

    if (bearerToken) {
      return this.authenticateWithJwt(request, bearerToken);
    }

    const apiKey = this.extractApiKeyFromHeader(request);
    if (apiKey) {
      return this.authenticateWithApiKey(request, apiKey);
    }

    throw new DomainException({
      type: 'https://agentloom.dev/errors/token-missing',
      title: 'Unauthorized',
      status: 401,
      detail:
        'Authorization header or X-Api-Key header is missing or malformed',
    });
  }

  private async authenticateWithJwt(
    request: FastifyRequest,
    token: string,
  ): Promise<boolean> {
    if (await this.tokenBlacklist.isBlacklisted(token)) {
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

      const supabaseUserId = payload.sub;
      const resolver = this.getUserIdentityResolver();
      const appUserId = await resolver.resolveAppUserId(supabaseUserId);

      if (!appUserId) {
        this.logger.warn(
          `No application user found for Supabase auth ID: ${supabaseUserId}`,
        );
        throw this.createInvalidTokenException(
          'User account not found in application',
        );
      }

      payload.supabaseUserId = supabaseUserId;
      payload.sub = appUserId;

      this.setRequestAuth(request, payload, 'jwt');
      return true;
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

  private async authenticateWithApiKey(
    request: FastifyRequest,
    apiKey: string,
  ): Promise<boolean> {
    try {
      const tokenService = this.getPlatformApiTokenService();
      const validated = await tokenService.validateToken(apiKey);

      const payload: JwtPayload = {
        sub: validated.userId,
        email: '',
        aud: 'authenticated',
        exp: 0,
        iat: 0,
        tenantId: validated.tenantId,
        tenantRole: validated.tenantRole,
      };

      this.setRequestAuth(request, payload, 'api_key', {
        apiKeyPrefix: validated.tokenPrefix,
      });

      tokenService.updateLastUsedAt(validated.tokenId).catch((err) => {
        this.logger.warn(
          `Failed to update lastUsedAt for token ${validated.tokenId}: ${err.message}`,
        );
      });

      return true;
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/api-key-invalid',
        title: 'Unauthorized',
        status: 401,
        detail: 'API key is invalid',
      });
    }
  }

  private setRequestAuth(
    request: FastifyRequest,
    payload: JwtPayload,
    authMethod: AuthMethod,
    options: {
      apiKeyPrefix?: string;
    } = {},
  ): void {
    const req = request as RequestWithAuthContext;
    req.user = payload;
    req.authMethod = authMethod;

    if (authMethod === 'api_key' && payload.tenantId) {
      req.tenantId = payload.tenantId;
      req.apiKeyPrefix = options.apiKeyPrefix;
      return;
    }

    delete req.apiKeyPrefix;
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

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) return undefined;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  private extractApiKeyFromHeader(request: FastifyRequest): string | undefined {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') return undefined;
    return apiKey;
  }
}
