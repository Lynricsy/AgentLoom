import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthApiError,
  AuthError,
  AuthUnknownError,
  GoTrueClient,
  isAuthApiError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js';
import { z } from 'zod';

import { AuthUnavailableException } from '../../../common/exceptions/auth.exceptions';
import type { OAuthProvider } from '../dto/oauth.dto';

/** 与 env schema 中 `APP_SUPABASE_AUTH_TIMEOUT_MS` 的默认值一致 */
const DEFAULT_AUTH_TIMEOUT_MS = 10_000;

/** GoTrue 错误体：新版 `{ code, error_code, msg }`，`/token` 旧版 `{ error, error_description }` */
const GoTrueErrorBodySchema = z.object({
  msg: z.string().optional(),
  message: z.string().optional(),
  error_description: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
});

const RefreshedSessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
});

export type RefreshedSession = z.infer<typeof RefreshedSessionSchema>;

@Injectable()
export class SupabaseService {
  private readonly deploymentMode: 'saas' | 'private';
  /** `<APP_SUPABASE_URL>/auth/v1`，仅在配置完整时有值 */
  private readonly authUrl?: string;
  private readonly supabaseServiceKey?: string;
  private readonly supabaseAnonKey?: string;
  private readonly isSupabaseConfigured: boolean;
  /** 单个 GoTrue 请求的超时（含读取响应体） */
  private readonly requestTimeoutMs: number;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {
    this.deploymentMode =
      this.configService.get<'saas' | 'private'>('APP_DEPLOYMENT_MODE') ??
      'saas';
    const supabaseUrl = this.configService.get<string>('APP_SUPABASE_URL');
    this.supabaseServiceKey = this.configService.get<string>(
      'APP_SUPABASE_SERVICE_KEY',
    );
    this.supabaseAnonKey = this.configService.get<string>(
      'APP_SUPABASE_ANON_KEY',
    );
    this.isSupabaseConfigured = [
      supabaseUrl,
      this.supabaseServiceKey,
      this.supabaseAnonKey,
    ].every((value) => typeof value === 'string' && value.trim().length > 0);
    if (this.isSupabaseConfigured) {
      this.authUrl = `${supabaseUrl!.replace(/\/+$/, '')}/auth/v1`;
    }
    this.requestTimeoutMs =
      this.configService.get<number>('APP_SUPABASE_AUTH_TIMEOUT_MS') ??
      DEFAULT_AUTH_TIMEOUT_MS;
  }

  // ─── 邮箱密码认证 ───────────────────────────────────────────

  async signUp(email: string, password: string) {
    const { data, error } = await this.createAuthClient('service').signUp({
      email,
      password,
    });

    if (error) {
      this.logger.warn(`SignUp failed for ${email}: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.createAuthClient(
      'service',
    ).signInWithPassword({
      email,
      password,
    });

    if (error) {
      this.logger.warn(`SignIn failed for ${email}: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  /**
   * 直接调用 GoTrue `POST /token?grant_type=refresh_token`，不经 auth-js `refreshSession`：
   * 后者对网络错误和 5xx 以指数退避重试，直到 30 s 窗口用尽，单请求超时无法约束总耗时。
   */
  async refreshToken(refreshToken: string): Promise<RefreshedSession> {
    this.ensureAvailable();

    const response = await this.requestGoTrue(
      'Token refresh',
      '/token?grant_type=refresh_token',
      {
        method: 'POST',
        headers: {
          apikey: this.supabaseServiceKey!,
          Authorization: `Bearer ${this.supabaseServiceKey!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    const session = RefreshedSessionSchema.safeParse(
      await response.json().catch(() => null),
    );

    if (!session.success) {
      this.logger.warn('Token refresh failed: unexpected GoTrue response');
      throw AuthUnavailableException.upstreamUnavailable();
    }

    return session.data;
  }

  async signOut(accessToken: string) {
    const { error } =
      await this.createAuthClient('service').admin.signOut(accessToken);

    if (error) {
      this.logger.warn(`SignOut failed: ${error.message}`);
      throw this.toServiceError(error);
    }
  }

  async getUser(accessToken: string) {
    const { data, error } =
      await this.createAuthClient('service').getUser(accessToken);

    if (error) {
      this.logger.warn(`GetUser failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data.user;
  }

  /**
   * 以用户自己的会话修改密码：GoTrue 用户态改密只注销该用户的其他会话、保留当前会话，
   * 而 admin `updateUserById` 会注销全部会话。auth-js 的 `updateUser` 依赖本地持久会话，
   * 服务端 user client 不持久化会话，因此直接调用 GoTrue `PUT /auth/v1/user`。
   */
  async updatePasswordForSession(accessToken: string, newPassword: string) {
    this.ensureAvailable();

    await this.requestGoTrue('UpdatePassword', '/user', {
      method: 'PUT',
      headers: {
        apikey: this.supabaseAnonKey!,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
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

    const { data, error } = await this.createAuthClient('anon').signInWithOAuth(
      {
        provider,
        options,
      },
    );

    if (error) {
      this.logger.warn(
        `OAuth initiate failed for ${provider}: ${error.message}`,
      );
      throw this.toServiceError(error);
    }

    return data;
  }

  async exchangeCodeForSession(code: string) {
    const { data, error } =
      await this.createAuthClient('anon').exchangeCodeForSession(code);

    if (error) {
      this.logger.warn(`OAuth code exchange failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  // ─── MFA (TOTP) ─────────────────────────────────────────────

  async enrollTotp(accessToken: string) {
    const userClient = this.createAuthClient('anon', accessToken);
    const { data, error } = await userClient.mfa.enroll({
      factorType: 'totp',
    });

    if (error) {
      this.logger.warn(`MFA TOTP enroll failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  async challengeAndVerifyTotp(
    accessToken: string,
    factorId: string,
    code: string,
  ) {
    const userClient = this.createAuthClient('anon', accessToken);

    const { data: challengeData, error: challengeError } =
      await userClient.mfa.challenge({ factorId });

    if (challengeError) {
      this.logger.warn(`MFA challenge failed: ${challengeError.message}`);
      throw this.toServiceError(challengeError);
    }

    const { data, error } = await userClient.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (error) {
      this.logger.warn(`MFA verify failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  async unenrollFactor(accessToken: string, factorId: string) {
    const userClient = this.createAuthClient('anon', accessToken);
    const { data, error } = await userClient.mfa.unenroll({ factorId });

    if (error) {
      this.logger.warn(`MFA unenroll failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  async listFactors(accessToken: string) {
    const userClient = this.createAuthClient('anon', accessToken);
    const { data, error } = await userClient.mfa.listFactors();

    if (error) {
      this.logger.warn(`MFA list factors failed: ${error.message}`);
      throw this.toServiceError(error);
    }

    return data;
  }

  async getAuthenticatorAssuranceLevel(accessToken: string) {
    const userClient = this.createAuthClient('anon', accessToken);
    // user client 不持有会话，必须显式传入 JWT；无参调用读本地会话，恒得 currentLevel=null
    const { data, error } =
      await userClient.mfa.getAuthenticatorAssuranceLevel(accessToken);

    if (error) {
      this.logger.warn(
        `MFA authenticator assurance level lookup failed: ${error.message}`,
      );
      throw this.toServiceError(error);
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
    throw AuthUnavailableException.notConfigured(this.deploymentMode);
  }

  /**
   * 上游故障改抛 503 `auth-unavailable`，其余错误（凭据错误、token 失效、参数非法）原样抛出，
   * 由调用方映射为 401/4xx。上游故障指：GoTrue 不可达或超时（auth-js 把 fetch 异常包成
   * status 0 的 `AuthRetryableFetchError`）、返回 5xx，或返回无法解析的响应（`AuthUnknownError`）。
   */
  private toServiceError(error: AuthError): Error {
    if (
      isAuthRetryableFetchError(error) ||
      error instanceof AuthUnknownError ||
      (isAuthApiError(error) && error.status >= 500)
    ) {
      return AuthUnavailableException.upstreamUnavailable();
    }

    return error;
  }

  /** 给每个 GoTrue 请求加超时；auth-js client 与直连 REST 共用 */
  private readonly fetchWithTimeout: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

  /** 直连 GoTrue REST；与 `toServiceError` 同一套分类：不可达/超时/5xx → 503，其余 4xx → AuthApiError */
  private async requestGoTrue(
    operation: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    let response: Response;

    try {
      response = await this.fetchWithTimeout(`${this.authUrl!}${path}`, init);
    } catch (error) {
      this.logger.warn(
        `${operation} failed: GoTrue unreachable (${error instanceof Error ? error.message : String(error)})`,
      );
      throw AuthUnavailableException.upstreamUnavailable();
    }

    if (response.status >= 500) {
      this.logger.warn(`${operation} failed: GoTrue HTTP ${response.status}`);
      throw AuthUnavailableException.upstreamUnavailable();
    }

    if (!response.ok) {
      const parsed = GoTrueErrorBodySchema.safeParse(
        await response.json().catch(() => null),
      );
      const body = parsed.success ? parsed.data : {};
      const message =
        body.msg ??
        body.message ??
        body.error_description ??
        body.error ??
        `HTTP ${response.status}`;
      this.logger.warn(`${operation} failed: ${message}`);
      throw new AuthApiError(
        message,
        response.status,
        body.error_code ??
          (typeof body.code === 'string' ? body.code : undefined),
      );
    }

    return response;
  }

  /**
   * 每次调用新建、用完即弃的 GoTrue client，不缓存、不持久化会话。
   *
   * auth-js client 带实例级可变状态：会话存储、refresh 单飞（`refreshingDeferred`：并发
   * refresh 直接共享在途 Promise，不比对 refresh token）、refresh 落盘前的存储 commit guard、
   * PKCE verifier。服务端单例 client 一旦承接多个用户的调用，B 的 refresh 会拿到 A 的会话，
   * A 的登录也会让 B 进行中的 refresh 被丢弃。
   *
   * `accessToken` 给定时以用户 JWT 作 Authorization（MFA 等用户态接口）；
   * `hasCustomAuthorizationHeader` 让 auth-js 在无本地会话时仍用该 header 发请求。
   */
  private createAuthClient(
    key: 'service' | 'anon',
    accessToken?: string,
  ): GoTrueClient {
    this.ensureAvailable();
    const apiKey =
      key === 'service' ? this.supabaseServiceKey! : this.supabaseAnonKey!;

    return new GoTrueClient({
      url: this.authUrl!,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken ?? apiKey}`,
      },
      hasCustomAuthorizationHeader: accessToken !== undefined,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      fetch: this.fetchWithTimeout,
    });
  }
}
