import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { AuthApiError, type User as SupabaseUser } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { users } from '../../database/schema';
import { DomainException } from '../../common/exceptions/domain.exception';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { SupabaseService } from './supabase/supabase.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly tokenBlacklist: TokenBlacklistService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      const authData = await this.supabaseService.signUp(
        dto.email,
        dto.password,
      );

      if (!authData.user) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/registration-failed',
          title: 'Registration Failed',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail: 'Failed to create authentication account',
        });
      }

      let userRecord: typeof users.$inferSelect | undefined;
      try {
        const [inserted] = await this.db
          .insert(users)
          .values({
            supabaseUserId: authData.user.id,
            email: dto.email,
            displayName: dto.display_name ?? null,
          })
          .returning();
        userRecord = inserted;
      } catch (dbError) {
        this.logger.error(
          `Failed to create user record for ${dto.email}, GoTrue account created but DB insert failed. Will retry on next login.`,
          dbError instanceof Error ? dbError.stack : undefined,
        );
        throw new DomainException({
          type: 'https://agentloom.dev/errors/registration-partial',
          title: 'Registration Partially Failed',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail:
            'Account created but profile setup failed. Please try logging in.',
        });
      }

      const userResponse = {
        id: userRecord.id,
        email: userRecord.email,
        display_name: userRecord.displayName,
        created_at: userRecord.createdAt,
      };

      if (!authData.session) {
        this.logger.warn(
          `Registration for ${dto.email}: email confirmation required (session=null)`,
        );
        return {
          data: {
            user: userResponse,
            tokens: null,
            email_confirmation_required: true,
          },
        };
      }

      return {
        data: {
          user: userResponse,
          tokens: {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_in: authData.session.expires_in,
          },
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (error instanceof AuthApiError) {
        if (this.isEmailConflictError(error)) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/email-conflict',
            title: 'Conflict',
            status: HttpStatus.CONFLICT,
            detail: 'An account with this email already exists',
          });
        }
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/registration-failed',
        title: 'Registration Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred during registration',
      });
    }
  }

  async login(dto: LoginDto) {
    try {
      const authData = await this.supabaseService.signIn(
        dto.email,
        dto.password,
      );

      let userRecord = await this.findUserByEmail(dto.email);

      if (!userRecord && authData.user) {
        userRecord = await this.backfillUserRecord(authData.user.id, dto.email);
      }

      const verifiedTotpFactors = await this.getVerifiedTotpFactors(
        authData.session.access_token,
      );

      if (verifiedTotpFactors.length > 0) {
        const jwtSecret = this.configService?.get<string>('APP_JWT_SECRET');

        if (!jwtSecret) {
          throw new Error('APP_JWT_SECRET is not configured');
        }

        const userId = userRecord?.id ?? authData.user?.id ?? dto.email;
        const mfaToken = jwt.sign(
          {
            sub: userId,
            email: dto.email,
            aud: 'authenticated',
            type: 'mfa_pending',
            supabaseAccessToken: authData.session.access_token,
          },
          jwtSecret,
          {
            algorithm: 'HS256',
            expiresIn: '5m',
          },
        );

        return {
          data: {
            mfaRequired: true,
            mfaToken,
            factors: verifiedTotpFactors.map((factor) => ({
              id: factor.id,
              friendlyName: factor.friendly_name,
            })),
          },
        };
      }

      return {
        data: {
          user: userRecord
            ? {
                id: userRecord.id,
                email: userRecord.email,
                display_name: userRecord.displayName,
                created_at: userRecord.createdAt,
              }
            : null,
          tokens: {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_in: authData.session.expires_in,
          },
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (error instanceof AuthApiError) {
        if (this.isInvalidCredentialsError(error)) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/invalid-credentials',
            title: 'Unauthorized',
            status: HttpStatus.UNAUTHORIZED,
            detail: 'Invalid email or password',
          });
        }
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/login-failed',
        title: 'Login Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred during login',
      });
    }
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const authData = await this.supabaseService.refreshToken(
        dto.refresh_token,
      );

      if (!authData.session) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/refresh-failed',
          title: 'Token Refresh Failed',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail: 'Failed to refresh token',
        });
      }

      return {
        data: {
          tokens: {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_in: authData.session.expires_in,
          },
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (error instanceof AuthApiError) {
        if (this.isInvalidRefreshTokenError(error)) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/refresh-invalid',
            title: 'Unauthorized',
            status: HttpStatus.UNAUTHORIZED,
            detail: 'Refresh token is invalid or has been revoked',
          });
        }
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/refresh-failed',
        title: 'Token Refresh Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred during token refresh',
      });
    }
  }

  async logout(accessToken: string) {
    const decoded = this.decodeAccessTokenClaims(accessToken);

    if (decoded?.exp) {
      try {
        await this.tokenBlacklist.add(accessToken, decoded.exp, decoded.sub);
      } catch (error) {
        this.logger.error(
          'Failed to persist revoked access token',
          error instanceof Error ? error.stack : undefined,
        );
        throw new DomainException({
          type: 'https://agentloom.dev/errors/logout-failed',
          title: 'Logout Failed',
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail: 'Failed to revoke access token',
        });
      }
    }

    try {
      await this.supabaseService.signOut(accessToken);
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.error(
        'Failed to sign out from Supabase',
        error instanceof Error ? error.stack : undefined,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/logout-failed',
        title: 'Logout Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'Failed to invalidate session',
      });
    }
  }

  async getSecurityInfo(accessToken: string) {
    const factors = await this.supabaseService.listFactors(accessToken);
    const user = await this.supabaseService.getUser(accessToken);
    const activeSessionCount = await this.getActiveSessionCount(
      user?.id ?? this.decodeAccessTokenClaims(accessToken)?.sub,
    );

    return {
      mfa: {
        enabled: factors.totp.some((factor) => factor.status === 'verified'),
        factors: factors.totp.map((factor) => ({
          id: factor.id,
          factor_type: 'totp' as const,
          friendly_name:
            typeof factor.friendly_name === 'string'
              ? factor.friendly_name
              : undefined,
          status: factor.status,
          created_at: factor.created_at,
          updated_at: factor.updated_at ?? factor.created_at,
        })),
      },
      sessions: {
        active_count: activeSessionCount,
      },
      providers: this.extractProviders(user),
    };
  }

  async changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/same-password',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: '新密码不能与当前密码相同',
      });
    }

    let supabaseUser: SupabaseUser | null;

    try {
      supabaseUser = await this.supabaseService.getUser(accessToken);
    } catch (error) {
      if (error instanceof DomainException) throw error;

      throw new DomainException({
        type: 'https://agentloom.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Failed to authenticate user',
      });
    }

    if (!supabaseUser?.email) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Unable to identify authenticated user',
      });
    }

    try {
      await this.supabaseService.signIn(supabaseUser.email, currentPassword);
    } catch (error) {
      if (error instanceof DomainException) throw error;

      if (error instanceof AuthApiError) {
        if (this.isInvalidCredentialsError(error)) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/wrong-current-password',
            title: 'Unauthorized',
            status: HttpStatus.UNAUTHORIZED,
            detail: '当前密码不正确',
          });
        }
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/change-password-failed',
        title: 'Change Password Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred while verifying current password',
      });
    }

    try {
      await this.supabaseService.updateUserPassword(
        supabaseUser.id,
        newPassword,
      );
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.error(
        `Failed to update password for user ${supabaseUser.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/change-password-failed',
        title: 'Change Password Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred while updating password',
      });
    }

    return { message: '密码修改成功' };
  }

  private async findUserByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  private async findUserBySupabaseId(supabaseUserId: string) {
    return this.db.query.users.findFirst({
      where: eq(users.supabaseUserId, supabaseUserId),
    });
  }

  private async backfillUserRecord(supabaseUserId: string, email: string) {
    await this.db
      .insert(users)
      .values({
        supabaseUserId,
        email,
      })
      .onConflictDoNothing();

    const userBySupabaseId = await this.findUserBySupabaseId(supabaseUserId);

    if (userBySupabaseId) {
      return userBySupabaseId;
    }

    const userByEmail = await this.findUserByEmail(email);

    if (userByEmail) {
      this.logger.error(
        `Failed to backfill user record for ${email}: email already belongs to supabase_user_id=${userByEmail.supabaseUserId}, expected ${supabaseUserId}`,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/login-failed',
        title: 'Login Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'Failed to reconcile authenticated user profile',
      });
    }

    this.logger.error(
      `Failed to backfill user record for ${email}: no local profile found after insert attempt`,
    );
    throw new DomainException({
      type: 'https://agentloom.dev/errors/login-failed',
      title: 'Login Failed',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Failed to create authenticated user profile',
    });
  }

  private async getVerifiedTotpFactors(accessToken: string) {
    if (typeof this.supabaseService.listFactors !== 'function') {
      return [];
    }

    const factors = await this.supabaseService.listFactors(accessToken);

    return factors.totp?.filter((factor) => factor.status === 'verified') ?? [];
  }

  private decodeAccessTokenClaims(accessToken: string) {
    const decoded = jwt.decode(accessToken);

    if (!decoded || typeof decoded !== 'object') {
      return null;
    }

    const raw = decoded as Record<string, unknown>;

    return {
      sub: typeof decoded.sub === 'string' ? decoded.sub : undefined,
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
      session_id:
        typeof raw['session_id'] === 'string' ? raw['session_id'] : undefined,
    };
  }

  private async getActiveSessionCount(userId?: string) {
    if (!userId) {
      return 0;
    }

    try {
      const result = await this.db.execute(sql`
        SELECT COUNT(*)::int AS active_count
        FROM auth.sessions
        WHERE user_id = ${userId}
          AND (not_after IS NULL OR not_after > NOW())
      `);
      const rawResult = result as unknown;
      const resultWithRows = rawResult as {
        rows?: Array<{ active_count?: number | string }>;
      };

      const rows = Array.isArray(rawResult)
        ? (rawResult as Array<{ active_count?: number | string }>)
        : Array.isArray(resultWithRows.rows)
          ? resultWithRows.rows
          : [];
      const value = rows[0]?.active_count;

      return typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? '0'), 10) || 0;
    } catch (error) {
      this.logger.warn(
        `Failed to count active sessions for ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return 1;
    }
  }

  async listSessions(accessToken: string) {
    const claims = this.decodeAccessTokenClaims(accessToken);
    const userId = claims?.sub;
    const currentSessionId = claims?.session_id;

    if (!userId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Unable to identify user from token',
      });
    }

    try {
      const result = await this.db.execute(sql`
        SELECT
          id::text,
          user_agent,
          ip::text AS ip,
          created_at,
          refreshed_at AS last_active_at
        FROM auth.sessions
        WHERE user_id = ${userId}::uuid
          AND (not_after IS NULL OR not_after > NOW())
        ORDER BY created_at DESC
      `);

      const rawResult = result as unknown;
      const resultWithRows = rawResult as {
        rows?: Array<{
          id?: string;
          user_agent?: string | null;
          ip?: string | null;
          created_at?: string | Date | null;
          last_active_at?: string | Date | null;
        }>;
      };
      const rows = Array.isArray(rawResult)
        ? (rawResult as Array<{
            id?: string;
            user_agent?: string | null;
            ip?: string | null;
            created_at?: string | Date | null;
            last_active_at?: string | Date | null;
          }>)
        : Array.isArray(resultWithRows.rows)
          ? resultWithRows.rows
          : [];

      return {
        data: {
          sessions: rows.map((row) => ({
            id: row.id ?? '',
            user_agent: row.user_agent ?? null,
            ip: row.ip ?? null,
            created_at: row.created_at
              ? new Date(row.created_at).toISOString()
              : null,
            last_active_at: row.last_active_at
              ? new Date(row.last_active_at).toISOString()
              : null,
            is_current: currentSessionId ? row.id === currentSessionId : false,
          })),
        },
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      this.logger.warn(
        `Failed to list sessions for ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { data: { sessions: [] } };
    }
  }

  async revokeSession(accessToken: string, sessionId: string) {
    const claims = this.decodeAccessTokenClaims(accessToken);
    const userId = claims?.sub;
    const currentSessionId = claims?.session_id;

    if (!userId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Unable to identify user from token',
      });
    }

    if (currentSessionId && sessionId === currentSessionId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/session-revoke-current',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'Cannot revoke the current active session',
      });
    }

    const checkResult = await this.db.execute(sql`
      SELECT id::text
      FROM auth.sessions
      WHERE id = ${sessionId}::uuid
        AND user_id = ${userId}::uuid
    `);

    const rawCheck = checkResult as unknown;
    const checkWithRows = rawCheck as {
      rows?: Array<{ id?: string }>;
    };
    const checkRows = Array.isArray(rawCheck)
      ? (rawCheck as Array<{ id?: string }>)
      : Array.isArray(checkWithRows.rows)
        ? checkWithRows.rows
        : [];

    if (checkRows.length === 0) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/session-not-found',
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: 'Session not found',
      });
    }

    await this.db.execute(sql`
      DELETE FROM auth.sessions
      WHERE id = ${sessionId}::uuid
        AND user_id = ${userId}::uuid
    `);

    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(accessToken: string) {
    const claims = this.decodeAccessTokenClaims(accessToken);
    const userId = claims?.sub;
    const currentSessionId = claims?.session_id;

    if (!userId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
        detail: 'Unable to identify user from token',
      });
    }

    const listResult = await this.db.execute(sql`
      SELECT id::text
      FROM auth.sessions
      WHERE user_id = ${userId}::uuid
        AND (not_after IS NULL OR not_after > NOW())
    `);

    const rawList = listResult as unknown;
    const listWithRows = rawList as { rows?: Array<{ id?: string }> };
    const allRows: Array<{ id?: string }> = Array.isArray(rawList)
      ? (rawList as Array<{ id?: string }>)
      : Array.isArray(listWithRows.rows)
        ? listWithRows.rows
        : [];

    const otherSessionIds = allRows
      .map((r) => r.id ?? '')
      .filter((id) => id && id !== currentSessionId);

    if (otherSessionIds.length === 0) {
      return { data: { revokedCount: 0 } };
    }

    for (const id of otherSessionIds) {
      await this.db.execute(sql`
        DELETE FROM auth.sessions
        WHERE id = ${id}::uuid
          AND user_id = ${userId}::uuid
      `);
    }

    return { data: { revokedCount: otherSessionIds.length } };
  }

  private extractProviders(user: SupabaseUser | null) {
    const providers = new Set<string>();
    const appMetadata =
      user &&
      typeof user.app_metadata === 'object' &&
      user.app_metadata !== null
        ? user.app_metadata
        : null;
    const configuredProviders = appMetadata?.providers;

    if (Array.isArray(configuredProviders)) {
      for (const provider of configuredProviders) {
        if (typeof provider === 'string' && provider.length > 0) {
          providers.add(provider);
        }
      }
    }

    if (typeof appMetadata?.provider === 'string' && appMetadata.provider) {
      providers.add(appMetadata.provider);
    }

    if (Array.isArray(user?.identities)) {
      for (const identity of user.identities) {
        if (typeof identity.provider === 'string' && identity.provider) {
          providers.add(identity.provider);
        }
      }
    }

    if (providers.size === 0 && user?.email) {
      providers.add('email');
    }

    return [...providers];
  }

  private isEmailConflictError(error: AuthApiError): boolean {
    const code = error.code?.toLowerCase();
    const message = error.message?.toLowerCase() ?? '';

    return code === 'email_exists' || message.includes('already registered');
  }

  private isInvalidCredentialsError(error: AuthApiError): boolean {
    const code = error.code?.toLowerCase();
    const message = error.message?.toLowerCase() ?? '';

    return (
      code === 'invalid_credentials' ||
      message.includes('invalid login credentials')
    );
  }

  private isInvalidRefreshTokenError(error: AuthApiError): boolean {
    const code = error.code?.toLowerCase();
    const message = error.message?.toLowerCase() ?? '';

    return (
      code === 'token_expired' ||
      code === 'invalid_refresh_token' ||
      message.includes('refresh token') ||
      message.includes('already used') ||
      message.includes('invalid jwt')
    );
  }
}
