import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('APP_SUPABASE_URL')!;
    const supabaseServiceKey = this.configService.get<string>(
      'APP_SUPABASE_SERVICE_KEY',
    )!;

    this.client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password });

    if (error) {
      this.logger.warn(`SignUp failed for ${email}: ${error.message}`);
      throw error;
    }

    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({
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
    const { data, error } = await this.client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      this.logger.warn(`Token refresh failed: ${error.message}`);
      throw error;
    }

    return data;
  }

  async signOut(accessToken: string) {
    const { error } = await this.client.auth.admin.signOut(accessToken);

    if (error) {
      this.logger.warn(`SignOut failed: ${error.message}`);
      throw error;
    }
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.client.auth.getUser(accessToken);

    if (error) {
      this.logger.warn(`GetUser failed: ${error.message}`);
      throw error;
    }

    return data.user;
  }
}
