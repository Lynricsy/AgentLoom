import { Inject, Injectable } from '@nestjs/common';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { AcpAuthenticationService } from '../acp-authentication.service';
import type { AcpConnectionState } from '../acp-types';

@Injectable()
export class AuthenticateHandler {
  constructor(
    @Inject(AcpAuthenticationService)
    private readonly acpAuthenticationService: AcpAuthenticationService,
  ) {}

  async handle(params: unknown, state: AcpConnectionState) {
    if (typeof params !== 'object' || params === null) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const token = (params as { token?: unknown }).token;
    if (typeof token !== 'string') {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const authContext = await this.acpAuthenticationService.authenticate(token);
    state.authContext = authContext;

    return {
      authenticated: true,
    };
  }
}
