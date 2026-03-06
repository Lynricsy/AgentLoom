import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase/supabase.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseService],
  exports: [AuthService],
})
export class AuthModule {}
