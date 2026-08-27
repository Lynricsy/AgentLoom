import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../../common/exceptions/tool-call.exceptions';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import { SandboxAgentAdapter } from '../agent/sandbox-agent.adapter';
import { AgentConversationService } from './agent-conversation.service';
import { ConversationTitleService } from './conversation-title.service';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { SelfEvolutionPermissionService } from '../self-evolution/self-evolution-permission.service';
import { SelfEvolutionService } from '../self-evolution/self-evolution.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ResolveConversationToolPermissionDto } from './dto/resolve-tool-permission.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { ToolPermissionCallbackDto } from './dto/tool-permission-callback.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  ConversationDetailResponseSwaggerDto,
  ConversationListResponseSwaggerDto,
  type ConversationDetailResponseDto,
  type ConversationListResponseDto,
} from './dto/conversation-response.dto';
import {
  MessageListResponseSwaggerDto,
  type MessageListResponseDto,
} from './dto/message-response.dto';

@ApiTags('Agent Conversations')
@Controller()
export class AgentConversationController {
  constructor(
    private readonly conversationService: AgentConversationService,
    private readonly conversationTitleService: ConversationTitleService,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly sandboxAgentAdapter: SandboxAgentAdapter,
    @Inject(AGENT_RUNTIME)
    private readonly inProcessAgentRuntime: IAgentRuntime,
    private readonly sandboxService: SandboxService,
    private readonly selfEvolutionPermissionService: SelfEvolutionPermissionService,
    private readonly selfEvolutionService: SelfEvolutionService,
  ) {}

  @Post('agent-definitions/:agentId/conversations')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new conversation for an agent' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  async create(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationService.create(agentId, tenantId, userId, dto);
  }

  @Post('agent-definitions/:agentId/conversations/start')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new conversation and send the first message atomically',
  })
  @ApiResponse({ status: 201, description: 'Conversation started' })
  async startConversation(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: StartConversationDto,
  ) {
    return this.conversationService.startConversation(
      agentId,
      tenantId,
      userId,
      dto,
    );
  }

  @Get('agent-definitions/:agentId/conversations')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'List conversations for an agent' })
  @ApiResponse({
    status: 200,
    description: 'Paginated conversation list',
    type: ConversationListResponseSwaggerDto,
  })
  async list(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ConversationListResponseDto> {
    return this.conversationService.listByAgent(agentId, query);
  }

  @Get('agent-conversations/:id')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Get conversation detail with message history' })
  @ApiResponse({
    status: 200,
    description: 'Conversation detail with messages',
    type: ConversationDetailResponseSwaggerDto,
  })
  async getDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ConversationDetailResponseDto> {
    return this.conversationService.getDetail(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('agent-conversations/:id/messages')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'List messages for a conversation' })
  @ApiResponse({
    status: 200,
    description: 'Paginated message list',
    type: MessageListResponseSwaggerDto,
  })
  async listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<MessageListResponseDto> {
    return this.conversationService.listMessages(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post('agent-conversations/:id/messages')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to a conversation' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationService.sendMessage(id, tenantId, dto);
  }

  @Post('agent-conversations/:id/cancel')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation cancelled' })
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationService.cancel(id);
  }

  @Post('agent-conversations/:id/tool-permission')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收沙箱容器的工具权限回调请求' })
  @ApiResponse({ status: 200, description: '返回是否允许工具执行' })
  async requestToolPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToolPermissionCallbackDto,
  ) {
    return this.sandboxAgentAdapter.awaitToolPermission(id, dto);
  }

  @Post('agent-conversations/:id/tool-permissions/:toolCallId/resolve')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '解析对话沙箱中的工具权限（批准/拒绝）' })
  @ApiResponse({ status: 202, description: '对话工具权限解析已接受' })
  @ApiResponse({ status: 409, description: '工具调用已不在等待审批状态' })
  async resolveToolPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolCallId') toolCallId: string,
    @Body() dto: ResolveConversationToolPermissionDto,
    @CurrentTenant() tenantId: string,
  ) {
    const hasPersistedToolCall =
      await this.conversationService.validateConversationToolCallPermissionState(
        tenantId,
        id,
        toolCallId,
      );

    const handledBySelfEvolution =
      await this.selfEvolutionPermissionService.resolveConversationRequest({
        conversationId: id,
        toolCallId,
        action: dto.action,
        rememberScope: dto.rememberScope,
      });

    if (!handledBySelfEvolution) {
      try {
        const target =
          await this.conversationService.getPermissionResolutionTarget(id);

        if (target.runtimeMode === 'no_sandbox') {
          if (!target.sessionId) {
            throw new ConflictException(
              `Conversation ${id} has no active in-process session`,
            );
          }

          await this.inProcessAgentRuntime.resolveToolPermission?.(
            target.sessionId,
            toolCallId,
            dto.action,
          );
        } else {
          await this.sandboxAgentAdapter.resolveConversationToolPermission(
            id,
            toolCallId,
            dto.action,
          );
        }
      } catch (error) {
        if (
          error instanceof ToolPermissionResolutionNotAllowedException &&
          !hasPersistedToolCall
        ) {
          // 持久历史与 live gate 都没有该调用时才是 404；已归档调用的矛盾状态已由
          // validator 提前按 409 拦截，不能让运行时的瞬时状态覆盖持久真相。
          throw new ToolCallNotFoundException(toolCallId);
        }
        throw error;
      }
    }

    return {
      data: {
        conversationId: id,
        toolCallId,
        status: 'permission_resolved',
        ...(dto.rememberScope ? { rememberScope: dto.rememberScope } : {}),
      },
    };
  }

  @Post('agent-conversations/:id/restart-latest-version')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '在当前会话内刷新到 Agent 最新已发布版本',
  })
  @ApiResponse({ status: 201, description: '当前会话已刷新到最新已发布版本' })
  async restartLatestVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.selfEvolutionService.restartConversationToLatestVersion(
      id,
      tenantId,
      userId,
    );
  }

  @Patch('agent-conversations/:id')
  @Roles('operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Update a conversation (title, metadata)' })
  @ApiResponse({ status: 200, description: 'Conversation updated' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationService.updateConversation(id, tenantId, dto);
  }

  @Post('agent-conversations/:id/generate-title')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate or regenerate conversation title' })
  @ApiResponse({ status: 200, description: 'Title generated' })
  async generateTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const title = await this.conversationTitleService.generateTitle(
      id,
      tenantId,
      userId,
    );
    return { data: { title } };
  }

  @Delete('agent-conversations/:id')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End and cleanup a conversation' })
  @ApiResponse({ status: 204, description: 'Conversation ended' })
  async end(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationService.end(id);
  }

  @Get('agent-conversations/:id/workspace/tree')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({
    summary: 'Get workspace file tree for a conversation sandbox',
  })
  @ApiResponse({ status: 200, description: 'File tree' })
  async getWorkspaceTree(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.workspaceIntegrationService.getFileTree(id, tenantId);
  }

  @Get('agent-conversations/:id/sandbox/stats')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Get resource stats for a conversation sandbox' })
  @ApiResponse({ status: 200, description: 'Conversation sandbox stats' })
  async getSandboxStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.sandboxService.getConversationSandboxStats(
      id,
      tenantId,
    );
    return { data };
  }

  @Get('agent-conversations/:id/sandbox/processes')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Get process list for a conversation sandbox' })
  @ApiResponse({ status: 200, description: 'Conversation sandbox processes' })
  async getSandboxProcesses(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.sandboxService.getConversationSandboxProcesses(
      id,
      tenantId,
    );
    return { data };
  }

  @Get('agent-conversations/:id/workspace/files/*')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Get workspace file content by path' })
  @ApiResponse({ status: 200, description: 'File content' })
  async getWorkspaceFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('*') filePath: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.workspaceIntegrationService.getFileContent(
      id,
      tenantId,
      filePath,
    );
  }

  @Post('agent-conversations/:id/pty/write')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '向对话关联沙箱的 PTY 会话写入数据' })
  @ApiResponse({ status: 200, description: 'PTY 写入成功' })
  @ApiResponse({ status: 503, description: '沙箱不可用' })
  async ptyWrite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { sessionId: string; data: string },
    @CurrentTenant() tenantId: string,
  ) {
    try {
      const result = await this.sandboxAgentAdapter.ptyWrite(
        { agentConversationId: id },
        tenantId,
        body.sessionId,
        body.data,
      );
      return { data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PTY 代理失败';
      if (message.includes('not found')) {
        throw new HttpException(
          { error: 'SANDBOX_NOT_FOUND', message },
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        { error: 'SANDBOX_UNAVAILABLE', message },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
