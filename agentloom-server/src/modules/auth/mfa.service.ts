import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthApiError } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import {
  Aal2RequiredException,
  MfaAlreadyEnrolledException,
  MfaDisableException,
  MfaEnrollmentException,
  MfaFactorNotFoundException,
  MfaTokenExpiredException,
  MfaVerificationException,
} from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import { SupabaseService } from './supabase/supabase.service';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async enrollTotp(supabaseAccessToken: string) {
    try {
      const factors = await this.supabaseService.listFactors(supabaseAccessToken);
      const hasVerifiedTotpFactor = factors.totp.some(
        (factor) => factor.status === 'verified',
      );

      if (hasVerifiedTotpFactor) {
        throw new MfaAlreadyEnrolledException();
      }

      const data = await this.supabaseService.enrollTotp(supabaseAccessToken);

      return {
        id: data.id,
        qr_code: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.error(
        'MFA TOTP 注册失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaEnrollmentException();
    }
  }

  async verifyTotp(
    authToken: string,
    factorId: string,
    code: string,
  ) {
    try {
      const supabaseAccessToken = this.resolveSupabaseAccessToken(authToken);
      const session = await this.supabaseService.challengeAndVerifyTotp(
        supabaseAccessToken,
        factorId,
        code,
      );

      if (!this.hasSessionTokens(session)) {
        throw new MfaVerificationException();
      }

      return {
        data: {
          tokens: this.buildTokenPayload(session),
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (this.isFactorNotFoundError(error)) {
        throw new MfaFactorNotFoundException(factorId);
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new MfaTokenExpiredException();
      }

      this.logger.error(
        'MFA TOTP 验证失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaVerificationException();
    }
  }

  async verifyMfaLogin(mfaToken: string, factorId: string, code: string) {
    return this.verifyTotp(mfaToken, factorId, code);
  }

  async disableMfa(supabaseAccessToken: string, code: string) {
    try {
      const assuranceLevel =
        await this.supabaseService.getAuthenticatorAssuranceLevel(
          supabaseAccessToken,
        );

      if (assuranceLevel.currentLevel !== 'aal2') {
        throw new Aal2RequiredException();
      }

      const factor = await this.getVerifiedTotpFactor(supabaseAccessToken);

      if (!factor) {
        throw new MfaFactorNotFoundException(
          'verified-totp',
          '当前账号不存在已验证的 TOTP MFA 因子',
        );
      }

      const verifiedSession = await this.supabaseService.challengeAndVerifyTotp(
        supabaseAccessToken,
        factor.id,
        code,
      );

      if (!this.hasSessionTokens(verifiedSession)) {
        throw new MfaVerificationException();
      }

      await this.supabaseService.unenrollFactor(supabaseAccessToken, factor.id);

      if (!verifiedSession.refresh_token) {
        throw new MfaDisableException('禁用 MFA 后未返回可刷新的会话令牌');
      }

      const refreshedSession = await this.supabaseService.refreshToken(
        verifiedSession.refresh_token,
      );

      if (!refreshedSession.session) {
        throw new MfaDisableException('禁用 MFA 后刷新会话失败');
      }

      return {
        message: 'MFA 已禁用',
        data: {
          tokens: this.buildTokenPayload(refreshedSession.session),
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (this.isFactorNotFoundError(error)) {
        throw new MfaFactorNotFoundException('verified-totp');
      }

      if (error instanceof AuthApiError) {
        throw new MfaVerificationException();
      }

      this.logger.error(
        'MFA 禁用失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaDisableException();
    }
  }

  private resolveSupabaseAccessToken(token: string): string {
    const jwtSecret = this.configService.get<string>('APP_JWT_SECRET');

    if (!jwtSecret) {
      return token;
    }

    try {
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
      });

      return this.extractSupabaseAccessToken(payload) ?? token;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        const decoded = jwt.decode(token);

        if (this.extractSupabaseAccessToken(decoded)) {
          throw new MfaTokenExpiredException();
        }

        throw new MfaVerificationException();
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return token;
      }

      throw error;
    }
  }

  private extractSupabaseAccessToken(
    payload: string | jwt.JwtPayload | null,
  ): string | null {
    if (
      !payload ||
      typeof payload === 'string' ||
      payload.type !== 'mfa_pending' ||
      typeof payload.supabaseAccessToken !== 'string' ||
      payload.supabaseAccessToken.length === 0
    ) {
      return null;
    }

    return payload.supabaseAccessToken;
  }

  private async getVerifiedTotpFactor(supabaseAccessToken: string) {
    const factors = await this.supabaseService.listFactors(supabaseAccessToken);

    return factors.totp.find((factor) => factor.status === 'verified');
  }

  private buildTokenPayload(session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number | null;
  }) {
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 0,
    };
  }

  private hasSessionTokens(
    session: {
      access_token?: string;
      refresh_token?: string;
    } | null | undefined,
  ): session is { access_token: string; refresh_token: string; expires_in?: number | null } {
    return (
      typeof session?.access_token === 'string' &&
      session.access_token.length > 0 &&
      typeof session.refresh_token === 'string' &&
      session.refresh_token.length > 0
    );
  }

  private isFactorNotFoundError(error: unknown): boolean {
    if (!(error instanceof AuthApiError)) {
      return false;
    }

    const code = error.code?.toLowerCase();
    const message = error.message?.toLowerCase() ?? '';

    return (
      error.status === 404 ||
      code === 'mfa_factor_not_found' ||
      (message.includes('factor') && message.includes('not found'))
    );
  }
}
