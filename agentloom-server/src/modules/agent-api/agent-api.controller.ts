import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AGENT_API_TERMINAL_RUN_STATUSES,
  type AgentApiRun,
} from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';

import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../openapi/swagger-document';
import { AgentApiEventStreamService } from '../agent-api-runtime/agent-api-event-stream.service';
import { AgentApiValidationException } from './agent-api.exceptions';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentApiService } from './agent-api.service';
import { pipeRunEventsToSse } from './agent-api-sse.util';
import type { AgentApiKeyContext } from './agent-api.types';
import { CurrentAgentApiKey } from './current-agent-api-key.decorator';
import {
  AgentApiPageQuerySchema,
  AgentApiPageQuerySwaggerDto,
  CreateAgentApiConversationSchema,
  CreateAgentApiConversationSwaggerDto,
  CreateAgentApiRunSchema,
  CreateAgentApiRunSwaggerDto,
  ListAgentApiConversationsQuerySchema,
  ListAgentApiConversationsQuerySwaggerDto,
  type AgentApiPageQuery,
  type CreateAgentApiConversationDto,
  type CreateAgentApiRunDto,
  type ListAgentApiConversationsQuery,
} from './dto/agent-api-request.dto';
import {
  AgentApiBoundAgentEnvelopeSwaggerDto,
  AgentApiConversationEnvelopeSwaggerDto,
  AgentApiConversationListSwaggerDto,
  AgentApiMessageListSwaggerDto,
  AgentApiRunEnvelopeSwaggerDto,
  AgentApiRunListSwaggerDto,
} from './dto/agent-api-response.dto';

/** 未结束 run 的建议轮询间隔（秒） */
export const AGENT_API_RUN_POLL_INTERVAL_SECONDS = 2;

const TERMINAL_RUN_STATUSES: readonly string[] = AGENT_API_TERMINAL_RUN_STATUSES;
const PREFER_WAIT_VALUE_PATTERN = /^([1-9]|[1-5][0-9]|60)$/;
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * 解析 RFC 7240 `Prefer` 头，只识别 `wait=<1-60>`；
 * 没有 wait 偏好返回 null，wait 取值非法时 422。
 */
export function parsePreferWait(header: string | undefined): number | null {
  if (!header) {
    return null;
  }

  for (const preference of header.split(',')) {
    const [name, ...rest] = preference.split('=');
    if (name.trim().toLowerCase() !== 'wait') {
      continue;
    }

    const value = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
    if (!PREFER_WAIT_VALUE_PATTERN.test(value)) {
      throw new AgentApiValidationException(
        'Prefer',
        'Prefer wait must be an integer between 1 and 60',
      );
    }
    return Number(value);
  }

  return null;
}

/**
 * 第三方以 `Authorization: Bearer alak_…` 调用已发布 Agent 的对外接口。
 * 不经过全局 JWT 认证与角色守卫；不设置 `request.user`，因此也不走全局租户事务，
 * 数据库访问由 AgentApiService 自行管理短事务。
 */
@ApiTags('Agent API')
@ApiBearerAuth()
@Public()
@UseGuards(AgentApiKeyGuard)
@ApiResponse({ status: 401, description: 'Key 缺失、无效、已吊销或已过期' })
@ApiResponse({ status: 429, description: '超出 Key 或租户的请求频率' })
@Controller('agent-api')
export class AgentApiController {
  constructor(
    private readonly agentApiService: AgentApiService,
    private readonly eventStream: AgentApiEventStreamService,
  ) {}

  @Get('agent')
  @ApiOperation({ summary: '读取 Key 绑定的 Agent 摘要' })
  @ApiResponse({
    status: 200,
    description: 'Agent 摘要',
    type: AgentApiBoundAgentEnvelopeSwaggerDto,
  })
  async getAgent(@CurrentAgentApiKey() key: AgentApiKeyContext) {
    return { data: await this.agentApiService.getAgent(key) };
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建对话（Agent 必须已发布）' })
  @ApiBody({ type: CreateAgentApiConversationSwaggerDto })
  @ApiResponse({
    status: 201,
    description: '已创建',
    type: AgentApiConversationEnvelopeSwaggerDto,
  })
  @ApiResponse({
    status: 409,
    description: 'agent-not-published / agent-archived',
  })
  @ApiResponse({ status: 422, description: '请求参数校验失败' })
  async createConversation(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Body(new ZodValidationPipe(CreateAgentApiConversationSchema))
    dto: CreateAgentApiConversationDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const data = await this.agentApiService.createConversation(key, dto);
    reply.header(
      'Location',
      `/${API_GLOBAL_PREFIX}/agent-api/conversations/${data.id}`,
    );
    return { data };
  }

  @Get('conversations')
  @ApiOperation({ summary: '列出当前 Key 创建的对话（createdAt 倒序）' })
  @ApiResponse({
    status: 200,
    description: '分页列表',
    type: AgentApiConversationListSwaggerDto,
  })
  async listConversations(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Query(new ZodValidationPipe(ListAgentApiConversationsQuerySchema))
    query: ListAgentApiConversationsQuerySwaggerDto,
  ) {
    return this.agentApiService.listConversations(
      key,
      query as ListAgentApiConversationsQuery,
    );
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: '读取对话' })
  @ApiResponse({
    status: 200,
    description: '对话',
    type: AgentApiConversationEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话不存在或不属于当前 Key' })
  async getConversation(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
  ) {
    return {
      data: await this.agentApiService.getConversation(key, conversationId),
    };
  }

  @Post('conversations/:conversationId/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '结束对话（幂等，进行中的 run 会被取消）' })
  @ApiResponse({
    status: 200,
    description: '已结束',
    type: AgentApiConversationEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话不存在或不属于当前 Key' })
  async endConversation(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
  ) {
    return {
      data: await this.agentApiService.endConversation(key, conversationId),
    };
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: '列出对话消息（仅 user/assistant，createdAt 正序）' })
  @ApiResponse({
    status: 200,
    description: '分页消息',
    type: AgentApiMessageListSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话不存在或不属于当前 Key' })
  async listMessages(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(AgentApiPageQuerySchema))
    query: AgentApiPageQuerySwaggerDto,
  ) {
    return this.agentApiService.listMessages(
      key,
      conversationId,
      query as AgentApiPageQuery,
    );
  }

  @Post('conversations/:conversationId/runs')
  @ApiOperation({
    summary: '发送用户输入并启动 run',
    description:
      '`Accept: text/event-stream` → 200 SSE；`Prefer: wait=N` → N 秒内结束返回 200，否则 202；默认 202 + Location。',
  })
  @ApiProduces('application/json', 'text/event-stream')
  @ApiHeader({
    name: 'Prefer',
    required: false,
    description: 'RFC 7240，仅识别 wait=<1-60>',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ type: CreateAgentApiRunSwaggerDto })
  @ApiResponse({
    status: 200,
    description: '等待期内已结束（Prefer wait）或 SSE 流',
    type: AgentApiRunEnvelopeSwaggerDto,
  })
  @ApiResponse({
    status: 202,
    description: 'run 已受理，尚未结束',
    type: AgentApiRunEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话不存在或不属于当前 Key' })
  @ApiResponse({
    status: 409,
    description:
      'conversation-busy / conversation-ended / agent-not-published / agent-archived',
  })
  @ApiResponse({
    status: 422,
    description: '请求参数校验失败或 idempotency-key-reused',
  })
  @ApiResponse({ status: 503, description: 'sandbox-maintenance' })
  async createRun(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(CreateAgentApiRunSchema))
    body: CreateAgentApiRunDto,
    @Headers('accept') accept: string | undefined,
    @Headers('prefer') prefer: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const waitSeconds = parsePreferWait(prefer);
    if (
      idempotencyKey !== undefined &&
      (idempotencyKey.length === 0 ||
        idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH)
    ) {
      throw new AgentApiValidationException(
        'Idempotency-Key',
        `Idempotency-Key must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
      );
    }

    const { run } = await this.agentApiService.createRun(key, conversationId, {
      body,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    if (accept?.includes('text/event-stream')) {
      const cursor = await this.agentApiService.openRunEvents(
        key,
        conversationId,
        run.id,
      );
      await pipeRunEventsToSse(reply, this.eventStream, {
        runId: run.id,
        ...cursor,
      });
      return;
    }

    let current: AgentApiRun = run;
    if (waitSeconds !== null) {
      const clientGone = new AbortController();
      const onClose = () => clientGone.abort();
      reply.raw.once('close', onClose);
      try {
        current = await this.agentApiService.waitForRun(
          key,
          run,
          waitSeconds,
          clientGone.signal,
        );
      } finally {
        reply.raw.off('close', onClose);
      }

      if (TERMINAL_RUN_STATUSES.includes(current.status)) {
        await reply
          .status(HttpStatus.OK)
          .header('Preference-Applied', `wait=${waitSeconds}`)
          .send({ data: current });
        return;
      }
    }

    await reply
      .status(HttpStatus.ACCEPTED)
      .header(
        'Location',
        `/${API_GLOBAL_PREFIX}/agent-api/conversations/${conversationId}/runs/${current.id}`,
      )
      .header('Retry-After', String(AGENT_API_RUN_POLL_INTERVAL_SECONDS))
      .send({ data: current });
  }

  @Get('conversations/:conversationId/runs')
  @ApiOperation({ summary: '列出对话的 run（createdAt 倒序）' })
  @ApiResponse({
    status: 200,
    description: '分页列表',
    type: AgentApiRunListSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话不存在或不属于当前 Key' })
  async listRuns(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(AgentApiPageQuerySchema))
    query: AgentApiPageQuerySwaggerDto,
  ) {
    return this.agentApiService.listRuns(
      key,
      conversationId,
      query as AgentApiPageQuery,
    );
  }

  @Get('conversations/:conversationId/runs/:runId')
  @ApiOperation({ summary: '读取 run（轮询入口，未结束时带 Retry-After）' })
  @ApiResponse({
    status: 200,
    description: 'run 当前状态',
    type: AgentApiRunEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话或 run 不存在' })
  async getRun(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const data = await this.agentApiService.getRun(key, conversationId, runId);
    if (!TERMINAL_RUN_STATUSES.includes(data.status)) {
      reply.header('Retry-After', String(AGENT_API_RUN_POLL_INTERVAL_SECONDS));
    }
    return { data };
  }

  @Post('conversations/:conversationId/runs/:runId/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '取消 run（幂等，跨实例生效，不结束对话）' })
  @ApiResponse({
    status: 202,
    description: '取消已受理，终态以 run.status 为准',
    type: AgentApiRunEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 404, description: '对话或 run 不存在' })
  @ApiResponse({ status: 409, description: 'run-not-cancellable' })
  async cancelRun(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const data = await this.agentApiService.cancelRun(
      key,
      conversationId,
      runId,
    );
    reply.header(
      'Location',
      `/${API_GLOBAL_PREFIX}/agent-api/conversations/${conversationId}/runs/${runId}`,
    );
    return { data };
  }

  @Get('conversations/:conversationId/runs/:runId/events')
  @ApiOperation({
    summary: '订阅 / 断线续传 run 事件流（SSE）',
    description:
      '带 Last-Event-ID 时从其后开始，不带时从头回放；事件保留到 run 终态后 1 小时。',
  })
  @ApiProduces('text/event-stream')
  @ApiHeader({ name: 'Last-Event-ID', required: false })
  @ApiResponse({ status: 200, description: 'SSE 流' })
  @ApiResponse({ status: 404, description: '对话或 run 不存在' })
  @ApiResponse({ status: 410, description: 'run-events-expired' })
  async streamRunEvents(
    @CurrentAgentApiKey() key: AgentApiKeyContext,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const cursor = await this.agentApiService.openRunEvents(
      key,
      conversationId,
      runId,
      lastEventId,
    );
    await pipeRunEventsToSse(reply, this.eventStream, { runId, ...cursor });
  }
}
