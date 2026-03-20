import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { OAuthProviderNotSupportedException } from '../../common/exceptions/auth.exceptions';
import {
  OAuthCallbackQueryDto,
  OAuthInitiateBodyDto,
  OAuthProviderSchema,
} from './dto/oauth.dto';
import { OAuthService } from './oauth.service';

@ApiTags('Auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post(':provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发起 OAuth 登录' })
  @ApiResponse({ status: 200, description: '成功返回 OAuth 授权地址' })
  @ApiResponse({ status: 400, description: 'OAuth 提供商不支持' })
  initiateOAuth(
    @Param('provider') provider: string,
    @Body() body: OAuthInitiateBodyDto,
  ) {
    const parsedProvider = OAuthProviderSchema.safeParse(provider);

    if (!parsedProvider.success) {
      throw new OAuthProviderNotSupportedException(provider);
    }

    return this.oauthService.initiateOAuth(
      parsedProvider.data,
      body.redirectUrl,
      body.platform,
    );
  }

  @Get('callback')
  @Public()
  @Redirect()
  @ApiOperation({ summary: '处理 OAuth 回调' })
  @ApiResponse({ status: 302, description: '重定向到前端回调地址' })
  async handleCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Res() reply: FastifyReply,
  ) {
    try {
      const result = await this.oauthService.handleCallback(
        query.code,
        query.platform,
      );
      reply.code(302);
      return reply.redirect(result.redirectUrl);
    } catch {
      if (query.platform === 'mobile') {
        reply.code(302);
        return reply.redirect(
          'agentloom://auth/callback?error=oauth_callback_failed',
        );
      }
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
      const callbackBaseUrl = `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
      reply.code(302);
      return reply.redirect(`${callbackBaseUrl}?error=oauth_callback_failed`);
    }
  }
}
