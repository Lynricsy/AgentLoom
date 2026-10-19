import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Public } from '../../common/decorators/public.decorator';
import { INVALID_JSON_BODY } from '../../common/http/body-parsers';
import type { EnvConfig } from '../../config/env.schema';
import { AgentApiEventStreamService } from '../agent-api-runtime/agent-api-event-stream.service';
import { AgentApiKeyGuard } from '../agent-api/agent-api-key.guard';
import type { AgentApiKeyContext } from '../agent-api/agent-api.types';
import { CurrentAgentApiKey } from '../agent-api/current-agent-api-key.decorator';
import { pipeTaskEventsToSse } from './a2a-sse.util';
import { A2aRpcError, toRpcError } from './a2a.exceptions';
import { A2aService } from './a2a.service';
import {
  A2A_ERRORS,
  A2A_METHODS,
  A2A_PROTOCOL_VERSION,
  A2A_PUSH_NOTIFICATION_METHODS,
  CancelTaskParamsSchema,
  GetTaskParamsSchema,
  JSON_RPC_ERRORS,
  JsonRpcIdSchema,
  JsonRpcRequestSchema,
  SendMessageParamsSchema,
  SubscribeToTaskParamsSchema,
  type A2aAgentCard,
  type JsonRpcId,
} from './a2a.types';

/**
 * A2A 1.0 入站（JSON-RPC 绑定）：每个已发布 Agent 一张公开 Agent Card 与一个 RPC 端点。
 * RPC 端点复用 Agent 对外 API 的 `alak_` Key 鉴权（`@Public()` + `AgentApiKeyGuard`），
 * 不设置 `request.user`，数据库访问由 AgentApiService 自行管理短事务。
 * 协议端点不进入 OpenAPI，对外约定见 `agentloom-docs/api/a2a.md`。
 */
@ApiExcludeController()
@Public()
@Controller('a2a')
export class A2aController {
  private readonly logger = new Logger(A2aController.name);

  constructor(
    private readonly a2aService: A2aService,
    private readonly eventStream: AgentApiEventStreamService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Get('agents/:agentDefinitionId/.well-known/agent-card.json')
  async getAgentCard(
    @Param('agentDefinitionId') agentDefinitionId: string,
    @Req() request: FastifyRequest,
  ): Promise<A2aAgentCard> {
    const baseUrl =
      this.configService.get('APP_PUBLIC_BASE_URL', { infer: true }) ??
      `${request.protocol}://${request.host}`;
    return this.a2aService.getAgentCard(agentDefinitionId, baseUrl);
  }

  @Post('agents/:agentDefinitionId/rpc')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AgentApiKeyGuard)
  async rpc(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('agentDefinitionId') agentDefinitionId: string,
    @Headers('a2a-version') version: string | undefined,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // 请求体不合法时也尽量回显 id，便于客户端关联
    const rawId = JsonRpcIdSchema.safeParse(
      typeof body === 'object' && body !== null && 'id' in body
        ? body.id
        : undefined,
    );
    let rpcId: JsonRpcId = rawId.success ? rawId.data : null;

    try {
      // 解析器对本路径放行非法 JSON（见 registerBodyParsers），按 JSON-RPC 回 Parse error
      if (body === INVALID_JSON_BODY) {
        throw new A2aRpcError(JSON_RPC_ERRORS.ParseError, 'Parse error');
      }
      if (key.agentDefinitionId !== agentDefinitionId) {
        throw new A2aRpcError(
          JSON_RPC_ERRORS.InvalidRequest,
          'API key does not belong to this agent',
        );
      }
      if (version !== undefined && version.trim() !== A2A_PROTOCOL_VERSION) {
        throw new A2aRpcError(
          A2A_ERRORS.VersionNotSupported,
          `A2A version ${version} is not supported; supported: ${A2A_PROTOCOL_VERSION}`,
        );
      }
      const request = JsonRpcRequestSchema.safeParse(body);
      if (!request.success) {
        throw new A2aRpcError(
          JSON_RPC_ERRORS.InvalidRequest,
          'Invalid Request',
        );
      }
      rpcId = request.data.id;
      const { method, params } = request.data;

      switch (method) {
        case A2A_METHODS.SendMessage: {
          const parsed = SendMessageParamsSchema.parse(params);
          const clientGone = new AbortController();
          const onClose = () => clientGone.abort();
          reply.raw.once('close', onClose);
          try {
            const result = await this.a2aService.sendMessage(
              key,
              parsed,
              clientGone.signal,
            );
            await this.sendResult(reply, rpcId, result);
          } finally {
            reply.raw.off('close', onClose);
          }
          return;
        }
        case A2A_METHODS.SendStreamingMessage: {
          const parsed = SendMessageParamsSchema.parse(params);
          const run = await this.a2aService.startMessageRun(key, parsed);
          await pipeTaskEventsToSse(reply, this.eventStream, { run, rpcId });
          return;
        }
        case A2A_METHODS.GetTask: {
          const parsed = GetTaskParamsSchema.parse(params);
          await this.sendResult(
            reply,
            rpcId,
            await this.a2aService.getTask(key, parsed.id, parsed.historyLength),
          );
          return;
        }
        case A2A_METHODS.CancelTask: {
          const parsed = CancelTaskParamsSchema.parse(params);
          await this.sendResult(
            reply,
            rpcId,
            await this.a2aService.cancelTask(key, parsed.id),
          );
          return;
        }
        case A2A_METHODS.SubscribeToTask: {
          const parsed = SubscribeToTaskParamsSchema.parse(params);
          const run = await this.a2aService.loadSubscribableRun(key, parsed.id);
          await pipeTaskEventsToSse(reply, this.eventStream, { run, rpcId });
          return;
        }
        case A2A_METHODS.ListTasks:
        case A2A_METHODS.GetExtendedAgentCard:
          throw new A2aRpcError(
            A2A_ERRORS.UnsupportedOperation,
            `${method} is not supported`,
          );
        default:
          if (A2A_PUSH_NOTIFICATION_METHODS.includes(method)) {
            throw new A2aRpcError(
              A2A_ERRORS.PushNotificationNotSupported,
              'push notifications are not supported',
            );
          }
          throw new A2aRpcError(
            JSON_RPC_ERRORS.MethodNotFound,
            `Method not found: ${method}`,
          );
      }
    } catch (error) {
      const mapped = toRpcError(error);
      if (mapped.unexpected) {
        this.logger.error(
          `A2A 请求处理失败: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      }
      // SSE 已接管响应后无法再改写为 JSON-RPC 错误，只能结束连接
      if (reply.sent || reply.raw.headersSent) {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        return;
      }
      if (mapped.headers) {
        reply.headers(mapped.headers);
      }
      await reply
        .status(mapped.httpStatus)
        .header('Content-Type', 'application/json')
        .send({ jsonrpc: '2.0', id: rpcId, error: mapped.error });
    }
  }

  private async sendResult(
    reply: FastifyReply,
    rpcId: JsonRpcId,
    result: unknown,
  ): Promise<void> {
    await reply
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: rpcId, result });
  }
}
