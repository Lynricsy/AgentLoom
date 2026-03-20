import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { AuthUnavailableException } from '../../../common/exceptions/auth.exceptions';
import type { OAuthProvider } from '../dto/oauth.dto';

@Injectable()
export class SupabaseService {
  private readonly deploymentMode: 'saas' | 'private';
  private readonly supabaseUrl?: string;
  private readonly supabaseServiceKey?: string;
  private readonly supabaseAnonKey?: string;
  private readonly isSupabaseConfigured: boolean;
  private adminClient?: SupabaseClient;
  private oauthClient?: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {
    this.deploymentMode =
      this.configService.get<'saas' | 'private'>('APP_DEPLOYMENT_MODE') ??
      'saas';
    this.supabaseUrl = this.configService.get<string>('APP_SUPABASE_URL');
    this.supabaseServiceKey = this.configService.get<string>(
      'APP_SUPABASE_SERVICE_KEY',
    );
    this.supabaseAnonKey = this.configService.get<string>(
      'APP_SUPABASE_ANON_KEY',
    );
    this.isSupabaseConfigured = [
      this.supabaseUrl,
      this.supabaseServiceKey,
      this.supabaseAnonKey,
    ].every((value) => typeof value === 'string' && value.trim().length > 0);
  }

  // ─── 邮箱密码认证 ───────────────────────────────────────────

  async signUp(email: string, password: string) {
    const { data, error } = await this.getAdminClient().auth.signUp({
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
    const { data, error } = await this.getAdminClient().auth.signInWithPassword({
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
    const { data, error } = await this.getAdminClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      this.logger.warn(`Token refresh failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async signOut(accessToken: string) {
    const { error } = await this.getAdminClient().auth.admin.signOut(
      accessToken,
    );

    if (error) {
      this.logger.warn(`SignOut failed: ${error.message}`);
      throw error;
    }
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.getAdminClient().auth.getUser(
      accessToken,
    );

    if (error) {
      this.logger.warn(`GetUser failed: ${error.message}`);
      throw error;
    }

    return data.user;
  }

  async updateUserPassword(supabaseUserId: string, newPassword: string) {
    const { data, error } =
      await this.getAdminClient().auth.admin.updateUserById(supabaseUserId, {
        password: newPassword,
      });

    if (error) {
      this.logger.warn(
        `UpdateUserPassword failed for ${supabaseUserId}: ${error.message}`,
      );
      throw error;
    }

    return data;
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

    const { data, error } = await this.getOauthClient().auth.signInWithOAuth({
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
      await this.getOauthClient().auth.exchangeCodeForSession(code);

    if (error) {
      this.logger.warn(`OAuth code exchange failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  // ─── MFA (TOTP) ─────────────────────────────────────────────

  createUserClient(accessToken: string): SupabaseClient {
    this.ensureAvailable();

    return createClient(this.supabaseUrl!, this.supabaseAnonKey!, {
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

  private ensureAvailable() {
    if (this.isSupabaseConfigured) {
      return;
    }

    this.logger.warn(
      `Supabase auth requested without complete configuration in ${this.deploymentMode} deployment mode`,
    );
    throw new AuthUnavailableException(this.deploymentMode);
  }

  private getAdminClient() {
    this.ensureClientsInitialized();

    return this.adminClient!;
  }

  private getOauthClient() {
    this.ensureClientsInitialized();

    return this.oauthClient!;
  }

  private ensureClientsInitialized() {
    this.ensureAvailable();

    if (!this.adminClient) {
      this.adminClient = createClient(
        this.supabaseUrl!,
        this.supabaseServiceKey!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        },
      );
    }

    if (!this.oauthClient) {
      this.oauthClient = createClient(this.supabaseUrl!, this.supabaseAnonKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
    }
  }
}
