import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { ShareService } from './share.service';

@Public()
@ApiTags('Workflow Shares')
@Controller('s')
export class SharePublicController {
  constructor(private readonly shareService: ShareService) {}

  @Get(':token')
  @ApiOperation({ summary: '公开访问分享的工作流定义' })
  @ApiResponse({ status: 200, description: '公开分享详情' })
  @ApiResponse({ status: 404, description: '分享链接不存在' })
  @ApiResponse({ status: 409, description: '工作流未发布' })
  @ApiResponse({ status: 410, description: '分享链接已过期或已撤销' })
  async getPublicShare(@Param('token') token: string) {
    return this.shareService.getPublicShare(token);
  }
}
