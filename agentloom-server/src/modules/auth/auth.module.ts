import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { SupabaseService } from './supabase/supabase.service';

@Module({
  controllers: [AuthController, OAuthController, MfaController],
  providers: [AuthService, OAuthService, MfaService, SupabaseService],
  exports: [AuthService],
})
export class AuthModule {}
