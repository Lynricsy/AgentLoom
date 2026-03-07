import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { OAuthProvider } from '../dto/oauth.dto';

@Injectable()
export class SupabaseService {
  private readonly adminClient: SupabaseClient;
  private readonly oauthClient: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('APP_SUPABASE_URL')!;
    const supabaseServiceKey = this.configService.get<string>(
      'APP_SUPABASE_SERVICE_KEY',
    )!;
    const supabaseAnonKey = this.configService.get<string>(
      'APP_SUPABASE_ANON_KEY',
    )!;

    this.adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    this.oauthClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  // ─── 邮箱密码认证 ───────────────────────────────────────────

  async signUp(email: string, password: string) {
    const { data, error } = await this.adminClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      this.logger.warn(`SignUp failed for ${email}: ${error.message}`);
      throw error;
    }

    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.adminClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      this.logger.warn(`SignIn failed for ${email}: ${error.message}`);
      throw error;
    }

    return data;
  }

  async refreshToken(refreshToken: string) {
    const { data, error } = await this.adminClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      this.logger.warn(`Token refresh failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async signOut(accessToken: string) {
    const { error } = await this.adminClient.auth.admin.signOut(accessToken);

    if (error) {
      this.logger.warn(`SignOut failed: ${error.message}`);
      throw error;
    }
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.adminClient.auth.getUser(accessToken);

    if (error) {
      this.logger.warn(`GetUser failed: ${error.message}`);
      throw error;
    }

    return data.user;
  }

  // ─── OAuth 社交登录 ─────────────────────────────────────────

  async signInWithOAuth(provider: OAuthProvider, redirectTo: string) {
    const options: {
      redirectTo: string;
      skipBrowserRedirect: true;
      queryParams?: Record<string, string>;
    } = {
      redirectTo,
      skipBrowserRedirect: true,
    };

    if (provider === 'google') {
      options.queryParams = { access_type: 'offline', prompt: 'consent' };
    }

    const { data, error } = await this.oauthClient.auth.signInWithOAuth({
      provider,
      options,
    });

    if (error) {
      this.logger.warn(
        `OAuth initiate failed for ${provider}: ${error.message}`,
      );
      throw error;
    }

    return data;
  }

  async exchangeCodeForSession(code: string) {
    const { data, error } =
      await this.oauthClient.auth.exchangeCodeForSession(code);

    if (error) {
      this.logger.warn(`OAuth code exchange failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  // ─── MFA (TOTP) ─────────────────────────────────────────────

  createUserClient(accessToken: string): SupabaseClient {
    const supabaseUrl = this.configService.get<string>('APP_SUPABASE_URL')!;
    const supabaseAnonKey = this.configService.get<string>(
      'APP_SUPABASE_ANON_KEY',
    )!;

    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  async enrollTotp(accessToken: string) {
    const userClient = this.createUserClient(accessToken);
    const { data, error } = await userClient.auth.mfa.enroll({
      factorType: 'totp',
    });

    if (error) {
      this.logger.warn(`MFA TOTP enroll failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async challengeAndVerifyTotp(
    accessToken: string,
    factorId: string,
    code: string,
  ) {
    const userClient = this.createUserClient(accessToken);

    const { data: challengeData, error: challengeError } =
      await userClient.auth.mfa.challenge({ factorId });

    if (challengeError) {
      this.logger.warn(`MFA challenge failed: ${challengeError.message}`);
      throw challengeError;
    }

    const { data, error } = await userClient.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (error) {
      this.logger.warn(`MFA verify failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async unenrollFactor(accessToken: string, factorId: string) {
    const userClient = this.createUserClient(accessToken);
    const { data, error } = await userClient.auth.mfa.unenroll({ factorId });

    if (error) {
      this.logger.warn(`MFA unenroll failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async listFactors(accessToken: string) {
    const userClient = this.createUserClient(accessToken);
    const { data, error } = await userClient.auth.mfa.listFactors();

    if (error) {
      this.logger.warn(`MFA list factors failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async getAuthenticatorAssuranceLevel(accessToken: string) {
    const userClient = this.createUserClient(accessToken);
    const { data, error } =
      await userClient.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) {
      this.logger.warn(
        `MFA authenticator assurance level lookup failed: ${error.message}`,
      );
      throw error;
    }

    return data;
  }
}
