import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  MfaAlreadyEnrolledException,
  MfaDisableException,
  MfaEnrollmentException,
  MfaTokenExpiredException,
  MfaVerificationException,
} from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { SecurityInfo } from './dto/security-info.dto';
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
    supabaseAccessToken: string,
    factorId: string,
    code: string,
  ) {
    try {
      await this.supabaseService.challengeAndVerifyTotp(
        supabaseAccessToken,
        factorId,
        code,
      );

      return { message: 'MFA 验证成功' };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.error(
        'MFA TOTP 验证失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaVerificationException();
    }
  }

  async verifyMfaLogin(mfaToken: string, factorId: string, code: string) {
    try {
      const jwtSecret = this.configService.get<string>('APP_JWT_SECRET');

      if (!jwtSecret) {
        throw new Error('APP_JWT_SECRET is not configured');
      }

      const payload = jwt.verify(mfaToken, jwtSecret, {
        algorithms: ['HS256'],
      });
      const supabaseAccessToken = this.extractSupabaseAccessToken(payload);
      const data = await this.supabaseService.challengeAndVerifyTotp(
        supabaseAccessToken,
        factorId,
        code,
      );

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (error instanceof jwt.TokenExpiredError) {
        throw new MfaTokenExpiredException();
      }

      this.logger.error(
        'MFA 登录验证失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaVerificationException();
    }
  }

  async disableMfa(
    supabaseAccessToken: string,
    factorId: string,
    code: string,
  ) {
    try {
      await this.supabaseService.challengeAndVerifyTotp(
        supabaseAccessToken,
        factorId,
        code,
      );
      await this.supabaseService.unenrollFactor(supabaseAccessToken, factorId);

      return { message: 'MFA 已禁用' };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.error(
        'MFA 禁用失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MfaDisableException();
    }
  }

  async getSecurityInfo(supabaseAccessToken: string): Promise<SecurityInfo> {
    const factors = await this.supabaseService.listFactors(supabaseAccessToken);

    return {
      mfaEnabled: factors.totp.some((factor) => factor.status === 'verified'),
      factors: factors.totp.map((factor) => ({
        id: factor.id,
        factorType: 'totp' as const,
        friendlyName:
          typeof factor.friendly_name === 'string'
            ? factor.friendly_name
            : undefined,
        status: factor.status,
        createdAt: factor.created_at,
        updatedAt: factor.updated_at ?? factor.created_at,
      })),
    };
  }

  private extractSupabaseAccessToken(
    payload: string | jwt.JwtPayload,
  ): string {
    if (
      typeof payload === 'string' ||
      payload.type !== 'mfa_pending' ||
      typeof payload.supabaseAccessToken !== 'string' ||
      payload.supabaseAccessToken.length === 0
    ) {
      throw new MfaVerificationException();
    }

    return payload.supabaseAccessToken;
  }
}
