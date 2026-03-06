import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  OAuthCallbackException,
  OAuthInitiationException,
} from '../../common/exceptions/auth.exceptions';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { users } from '../../database/schema';
import type { OAuthProvider } from './dto/oauth.dto';
import { SupabaseService } from './supabase/supabase.service';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async initiateOAuth(provider: OAuthProvider, redirectUrl?: string) {
    try {
      const redirectTo =
        redirectUrl ?? this.configService.get<string>('APP_OAUTH_REDIRECT_URL')!;
      const data = await this.supabaseService.signInWithOAuth(provider, redirectTo);

      if (!data.url) {
        throw new OAuthInitiationException(provider);
      }

      return { url: data.url };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      throw new OAuthInitiationException(provider);
    }
  }

  async handleCallback(code: string) {
    try {
      const { session, user: supabaseUser } =
        await this.supabaseService.exchangeCodeForSession(code);

      if (!session || !supabaseUser) {
        throw new OAuthCallbackException();
      }

      const user = await this.backfillOAuthUser(supabaseUser);
      const redirectUrl = this.buildFrontendRedirectUrl(session);

      return {
        redirectUrl,
        user,
        session,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;

      throw new OAuthCallbackException();
    }
  }

  private buildFrontendRedirectUrl(session: Session) {
    const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
    const callbackBaseUrl = `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
    const query = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    return `${callbackBaseUrl}?${query.toString()}`;
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

  private async backfillOAuthUser(supabaseUser: SupabaseUser) {
    const email = supabaseUser.email;

    if (!email) {
      this.logger.error(
        `Failed to backfill OAuth user ${supabaseUser.id}: missing email`,
      );
      throw new OAuthCallbackException('OAuth 用户缺少邮箱信息');
    }

    const displayName =
      this.readMetadataString(supabaseUser, 'full_name') ??
      this.readMetadataString(supabaseUser, 'name') ??
      email.split('@')[0];
    const avatarUrl =
      this.readMetadataString(supabaseUser, 'avatar_url') ??
      this.readMetadataString(supabaseUser, 'picture') ??
      null;

    await this.db
      .insert(users)
      .values({
        supabaseUserId: supabaseUser.id,
        email,
        displayName,
        avatarUrl,
      })
      .onConflictDoNothing();

    const userBySupabaseId = await this.findUserBySupabaseId(supabaseUser.id);

    if (userBySupabaseId) {
      return userBySupabaseId;
    }

    const userByEmail = await this.findUserByEmail(email);

    if (userByEmail) {
      this.logger.error(
        `Failed to backfill user record for ${email}: email already belongs to supabase_user_id=${userByEmail.supabaseUserId}, expected ${supabaseUser.id}`,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/oauth-callback-failed',
        title: 'OAuth 回调失败',
        status: HttpStatus.BAD_REQUEST,
        detail: 'Failed to reconcile authenticated user profile',
      });
    }

    this.logger.error(
      `Failed to backfill user record for ${email}: no local profile found after insert attempt`,
    );
    throw new DomainException({
      type: 'https://agentloom.dev/errors/oauth-callback-failed',
      title: 'OAuth 回调失败',
      status: HttpStatus.BAD_REQUEST,
      detail: 'Failed to create authenticated user profile',
    });
  }

  private readMetadataString(
    supabaseUser: SupabaseUser,
    key: string,
  ): string | undefined {
    const value = supabaseUser.user_metadata[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
