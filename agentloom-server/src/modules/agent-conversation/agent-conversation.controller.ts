import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
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
import { ToolPermissionCallbackDto } from './dto/tool-permission-callback.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@ApiTags('Agent Conversations')
@Controller()
export class AgentConversationController {
  constructor(
    private readonly conversationService: AgentConversationService,
    private readonly conversationTitleService: ConversationTitleService,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly sandboxAgentAdapter: SandboxAgentAdapter,
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

  @Get('agent-definitions/:agentId/conversations')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'List conversations for an agent' })
  @ApiResponse({ status: 200, description: 'Paginated conversation list' })
  async list(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationService.listByAgent(agentId, query);
  }

  @Get('agent-conversations/:id')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'Get conversation detail with message history' })
  @ApiResponse({
    status: 200,
    description: 'Conversation detail with messages',
  })
  async getDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationService.getDetail(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('agent-conversations/:id/messages')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: 'List messages for a conversation' })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  async listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
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
  async resolveToolPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolCallId') toolCallId: string,
    @Body() dto: ResolveConversationToolPermissionDto,
    @CurrentTenant() _tenantId: string,
  ) {
    const handledBySelfEvolution =
      await this.selfEvolutionPermissionService.resolveConversationRequest({
        conversationId: id,
        toolCallId,
        action: dto.action,
        rememberScope: dto.rememberScope,
      });

    if (!handledBySelfEvolution) {
      await this.sandboxAgentAdapter.resolveConversationToolPermission(
        id,
        toolCallId,
        dto.action,
      );
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
    summary: '重启当前会话到 Agent 最新已发布版本并继承历史消息',
  })
  @ApiResponse({ status: 201, description: '新会话已创建' })
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
