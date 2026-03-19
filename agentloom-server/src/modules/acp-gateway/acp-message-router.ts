import { Injectable } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  AcpJsonRpcError,
  buildJsonRpcError,
  buildJsonRpcSuccess,
  parseJsonRpcRequest,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './acp-jsonrpc';
import type { AcpConnectionState } from './acp-types';
import { AuthenticateHandler } from './handlers/authenticate.handler';
import { InitializeHandler } from './handlers/initialize.handler';
import { SessionCancelHandler } from './handlers/session-cancel.handler';
import { SessionLoadHandler } from './handlers/session-load.handler';
import { SessionNewHandler } from './handlers/session-new.handler';
import { SessionPromptHandler } from './handlers/session-prompt.handler';

@Injectable()
export class AcpMessageRouter {
  constructor(
    private readonly initializeHandler: InitializeHandler,
    private readonly authenticateHandler: AuthenticateHandler,
    private readonly sessionNewHandler: SessionNewHandler,
    private readonly sessionLoadHandler: SessionLoadHandler,
    private readonly sessionPromptHandler: SessionPromptHandler,
    private readonly sessionCancelHandler: SessionCancelHandler,
  ) {}

  async routeMessage(
    rawMessage: string,
    state: AcpConnectionState,
  ): Promise<JsonRpcResponse | null> {
    let requestId: string | number | null = null;
    let isNotification = false;

    try {
      const request = parseJsonRpcRequest(rawMessage);
      isNotification = this.isNotification(request);
      requestId = isNotification ? null : (request.id ?? null);

      if (request.method === 'initialize') {
        if (isNotification) {
          throw new AcpJsonRpcError(-32600, 'Invalid Request');
        }

        const result = await this.initializeHandler.handle(request.params, state);
        return buildJsonRpcSuccess(requestId, result);
      }

      if (!state.initialized) {
        if (isNotification) {
          return null;
        }

        throw new AcpJsonRpcError(-32001, 'Server not initialized');
      }

      if (request.method === 'initialized') {
        state.initializedNotificationReceived = true;
        return null;
      }

      if (request.method === 'authenticate') {
        if (isNotification) {
          throw new AcpJsonRpcError(-32600, 'Invalid Request');
        }

        const result = await this.authenticateHandler.handle(request.params, state);
        return buildJsonRpcSuccess(requestId, result);
      }

      if (this.requiresAuthentication(request) && !state.authContext) {
        throw new AcpJsonRpcError(-32002, 'Authentication required');
      }

      if (request.method === 'session/new') {
        if (isNotification) {
          throw new AcpJsonRpcError(-32600, 'Invalid Request');
        }

        const result = await this.sessionNewHandler.handle(request.params, state);
        return buildJsonRpcSuccess(requestId, result);
      }

      if (request.method === 'session/load') {
        if (isNotification) {
          throw new AcpJsonRpcError(-32600, 'Invalid Request');
        }

        const result = await this.sessionLoadHandler.handle(request.params, state);
        return buildJsonRpcSuccess(requestId, result);
      }

      if (request.method === 'session/prompt') {
        if (isNotification) {
          throw new AcpJsonRpcError(-32600, 'Invalid Request');
        }

        const result = await this.sessionPromptHandler.handle(
          request.params,
          state,
          requestId,
        );
        return buildJsonRpcSuccess(requestId, result);
      }

      if (request.method === 'session/cancel') {
        await this.sessionCancelHandler.handle(request.params, state);
        return null;
      }

      if (isNotification) {
        return null;
      }

      return buildJsonRpcError(requestId, -32601, 'Method not found');
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        if (isNotification) {
          return null;
        }

        return buildJsonRpcError(requestId, error.code, error.message, error.data);
      }

      if (error instanceof DomainException) {
        if (isNotification) {
          return null;
        }

        return buildJsonRpcError(requestId, -32000, error.message, {
          status: error.getStatus(),
          type: error.type,
          detail: error.detail,
          ...(error.errors ? { errors: error.errors } : {}),
          ...(error.extensions ? { extensions: error.extensions } : {}),
        });
      }

      if (isNotification) {
        return null;
      }

      return buildJsonRpcError(requestId, -32603, 'Internal error');
    }
  }

  private isNotification(request: JsonRpcRequest): boolean {
    return !Object.hasOwn(request, 'id');
  }

  private requiresAuthentication(request: JsonRpcRequest): boolean {
    return (
      request.method === 'session/new' ||
      request.method === 'session/load' ||
      request.method === 'session/prompt' ||
      request.method === 'session/cancel'
    );
  }
}
