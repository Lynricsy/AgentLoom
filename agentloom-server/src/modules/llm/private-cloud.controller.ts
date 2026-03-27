import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TestConnectionDto } from './dto/test-connection.dto';
import { FetchPrivateCloudModelsDto } from './dto/private-cloud-models.dto';
import { PrivateCloudService } from './private-cloud.service';

@ApiTags('LLM Private Cloud')
@Controller('llm')
export class PrivateCloudController {
  constructor(private readonly privateCloudService: PrivateCloudService) {}

  @Post('test-connection')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试私有云端点连接' })
  @ApiResponse({ status: 200, description: '连接测试成功' })
  @ApiResponse({ status: 502, description: '端点连接失败' })
  @ApiResponse({ status: 504, description: '连接超时' })
  async testConnection(
    @Body() dto: TestConnectionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('org_id') orgId: string,
  ) {
    const result = await this.privateCloudService.testConnection(dto, {
      tenantId,
      orgId,
    });
    return { data: result };
  }

  @Post('private-cloud/models')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取私有云端点可用模型列表' })
  @ApiResponse({ status: 200, description: '返回模型列表' })
  @ApiResponse({ status: 502, description: '获取模型列表失败' })
  async fetchModels(
    @Body() dto: FetchPrivateCloudModelsDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('org_id') orgId: string,
  ) {
    const result = await this.privateCloudService.fetchModels(dto, {
      tenantId,
      orgId,
    });
    return { data: result };
  }
}
