import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { SandboxService } from './sandbox.service';

@ApiTags('Sandboxes')
@Controller()
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('sandboxes/:sessionId/logs')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取沙箱日志' })
  @ApiResponse({ status: 200, description: '沙箱日志列表' })
  async getSandboxLogs(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    const logs = await this.sandboxService.getSandboxLogs(sessionId);
    return { data: logs };
  }
}
