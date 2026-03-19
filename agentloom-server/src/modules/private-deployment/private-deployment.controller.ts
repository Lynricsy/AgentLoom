import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdatePrivateDeploymentSettingsRequestDto } from './dto/update-private-deployment-settings.dto';
import { PrivateDeploymentService } from './private-deployment.service';

@ApiTags('Private Deployment')
@Controller()
export class PrivateDeploymentController {
  constructor(
    private readonly privateDeploymentService: PrivateDeploymentService,
  ) {}

  @Get('organizations/:id/private-deployment')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取组织私有部署设置' })
  @ApiResponse({ status: 200, description: '组织私有部署设置' })
  async getSettings(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const settings = await this.privateDeploymentService.getSettings(
      organizationId,
      userId,
    );

    return { data: settings };
  }

  @Put('organizations/:id/private-deployment')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新组织私有部署设置' })
  @ApiResponse({ status: 200, description: '更新后的组织私有部署设置' })
  async updateSettings(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdatePrivateDeploymentSettingsRequestDto,
    @CurrentUser('sub') userId: string,
  ) {
    const settings = await this.privateDeploymentService.updateSettings(
      organizationId,
      dto,
      userId,
    );

    return { data: settings };
  }
}
