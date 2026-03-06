import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { OAuthProviderNotSupportedException } from '../../../common/exceptions/auth.exceptions';
import { OAuthController } from '../oauth.controller';
import { OAuthService } from '../oauth.service';

const MOCK_FRONTEND_URL = 'http://localhost:5173';

function createMockOAuthService() {
  return {
    initiateOAuth: vi.fn(),
    handleCallback: vi.fn(),
  };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      const values = {
        APP_FRONTEND_URL: MOCK_FRONTEND_URL,
      };

      return values[key as keyof typeof values];
    }),
  };
}

describe('OAuthController', () => {
  let controller: OAuthController;
  let oauthService: ReturnType<typeof createMockOAuthService>;

  beforeEach(async () => {
    oauthService = createMockOAuthService();

    const module = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        { provide: OAuthService, useValue: oauthService },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    controller = module.get(OAuthController);
  });

  it('POST :provider 在 provider 合法时返回授权 URL', async () => {
    oauthService.initiateOAuth.mockResolvedValue({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });

    const result = await controller.initiateOAuth('google', {
      redirectUrl: 'https://custom.example.com/callback',
    });

    expect(result).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    expect(oauthService.initiateOAuth).toHaveBeenCalledWith(
      'google',
      'https://custom.example.com/callback',
    );
  });

  it('POST :provider 在 provider 非法时抛出 OAuthProviderNotSupportedException', () => {
    expect(() => controller.initiateOAuth('twitter', {})).toThrow(
      OAuthProviderNotSupportedException,
    );
    expect(oauthService.initiateOAuth).not.toHaveBeenCalled();
  });

  it('GET callback 成功时重定向到前端回调地址', async () => {
    const reply = {
      code: vi.fn().mockReturnThis(),
      redirect: vi.fn(),
    };
    oauthService.handleCallback.mockResolvedValue({
      redirectUrl:
        'http://localhost:5173/auth/callback?access_token=token-a&refresh_token=token-b',
      user: { id: 'user-1' },
      session: { access_token: 'token-a', refresh_token: 'token-b' },
    });

    await controller.handleCallback(
      { code: 'oauth-code-123' },
      reply as unknown as FastifyReply,
    );

    expect(oauthService.handleCallback).toHaveBeenCalledWith('oauth-code-123');
    expect(reply.code).toHaveBeenCalledWith(302);
    expect(reply.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/auth/callback?access_token=token-a&refresh_token=token-b',
    );
  });

  it('GET callback 失败时重定向到前端错误地址', async () => {
    const reply = {
      code: vi.fn().mockReturnThis(),
      redirect: vi.fn(),
    };
    oauthService.handleCallback.mockRejectedValue(
      new Error('oauth callback failed'),
    );

    await controller.handleCallback(
      { code: 'oauth-code-123' },
      reply as unknown as FastifyReply,
    );

    expect(reply.code).toHaveBeenCalledWith(302);
    expect(reply.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/auth/callback?error=oauth_callback_failed',
    );
  });
});
