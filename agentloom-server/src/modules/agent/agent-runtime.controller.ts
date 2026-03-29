import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { SandboxAgentAdapter } from './sandbox-agent.adapter';
import { SessionToolExecutionCallbackDto } from './dto/session-tool-execution-callback.dto';

@ApiTags('Agent Runtime')
@Controller('agent-runtime')
export class AgentRuntimeController {
  constructor(private readonly sandboxAgentAdapter: SandboxAgentAdapter) {}

  @Post('sessions/:sessionId/tool-executions')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接收 sandbox 容器的 session tool 执行回调' })
  @ApiResponse({ status: 200, description: '返回工具执行结果' })
  async executeSessionTool(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SessionToolExecutionCallbackDto,
    @Headers('x-agentloom-sandbox-session-token') callbackToken?: string,
  ) {
    return this.sandboxAgentAdapter.executeSessionToolCallback(
      sessionId,
      dto,
      callbackToken,
    );
  }
}
