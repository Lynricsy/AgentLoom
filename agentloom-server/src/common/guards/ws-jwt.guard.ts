import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsAuthError, WsAuthService } from '../services/ws-auth.service';

/**
 * 消息级兜底：握手中间件（WsAuthService.attachHandshake）已写入 socket.data.user 时直接放行；
 * 未经握手中间件的 socket 走同一个 WsAuthService 解析，身份契约与 HTTP 一致。
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly wsAuth: WsAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();

    if (client.data?.user) {
      return true;
    }

    try {
      const user = await this.wsAuth.authenticate(
        this.wsAuth.extractToken(client),
      );
      client.data = { ...client.data, user };
      return true;
    } catch (error) {
      throw new WsException(
        error instanceof WsAuthError ? error.message : 'Token is invalid',
      );
    }
  }
}
