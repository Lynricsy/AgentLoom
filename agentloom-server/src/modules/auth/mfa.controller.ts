import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import {
  MfaDisableDto,
  MfaLoginVerifyDto,
  MfaVerifyDto,
} from './dto/mfa.dto';
import { MfaService } from './mfa.service';

@ApiTags('Auth')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('totp/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册 TOTP MFA 因子' })
  @ApiResponse({ status: 200, description: 'TOTP MFA 注册成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 409, description: 'MFA 已启用' })
  enrollTotp(@Req() request: FastifyRequest) {
    return this.mfaService.enrollTotp(this.extractAccessToken(request));
  }

  @Post('totp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证 TOTP MFA 验证码' })
  @ApiResponse({ status: 200, description: 'MFA 验证成功' })
  @ApiResponse({ status: 401, description: 'MFA 验证失败' })
  verifyTotp(
    @Body() body: MfaVerifyDto,
    @Req() request: FastifyRequest,
  ) {
    return this.mfaService.verifyTotp(
      this.extractAccessToken(request),
      this.extractFactorId(body),
      body.code,
    );
  }

  @Post('login/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '完成登录阶段的 MFA 二次验证' })
  @ApiResponse({ status: 200, description: '登录 MFA 验证成功' })
  @ApiResponse({ status: 401, description: 'MFA 令牌无效或已过期' })
  verifyMfaLogin(@Body() body: MfaLoginVerifyDto) {
    return this.mfaService.verifyMfaLogin(
      this.extractMfaToken(body),
      this.extractFactorId(body),
      body.code,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用当前账号的 TOTP MFA' })
  @ApiResponse({ status: 200, description: 'MFA 已禁用' })
  @ApiResponse({ status: 401, description: '未认证或验证码无效' })
  disableMfa(
    @Body() body: MfaDisableDto,
    @Req() request: FastifyRequest,
  ) {
    return this.mfaService.disableMfa(
      this.extractAccessToken(request),
      body.code,
    );
  }

  private extractFactorId(body: {
    factor_id?: string;
    factorId?: string;
  }): string {
    return body.factor_id ?? body.factorId ?? '';
  }

  private extractMfaToken(body: {
    mfa_token?: string;
    mfaToken?: string;
  }): string {
    return body.mfa_token ?? body.mfaToken ?? '';
  }

  private extractAccessToken(request: FastifyRequest): string {
    const authorization = request.headers.authorization;

    return authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
  }
}
