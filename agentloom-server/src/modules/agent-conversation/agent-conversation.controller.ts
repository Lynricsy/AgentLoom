import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AgentConversationService } from './agent-conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Agent Conversations')
@Controller()
export class AgentConversationController {
  constructor(
    private readonly conversationService: AgentConversationService,
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
  @ApiResponse({ status: 200, description: 'Conversation detail with messages' })
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

  @Delete('agent-conversations/:id')
  @Roles('operator', 'creator', 'admin', 'owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End and cleanup a conversation' })
  @ApiResponse({ status: 204, description: 'Conversation ended' })
  async end(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationService.end(id);
  }
}
