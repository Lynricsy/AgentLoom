import {
  Controller,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { UserPreferenceService } from './user-preference.service';
import { UpdateUserPreferenceDto, UpdateUserPreferenceSchema } from './dto';

@ApiTags('User Preferences')
@Controller('user-preferences')
export class UserPreferenceController {
  constructor(private readonly userPreferenceService: UserPreferenceService) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户偏好设置' })
  @ApiResponse({ status: 200, description: '用户偏好设置' })
  async get(
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.userPreferenceService.getOrCreate(userId, tenantId);
    return { data };
  }

  @Patch()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新当前用户偏好设置' })
  @ApiResponse({ status: 200, description: '偏好设置已更新' })
  async update(
    @Body(new ZodValidationPipe(UpdateUserPreferenceSchema))
    dto: UpdateUserPreferenceDto,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.userPreferenceService.upsert(userId, tenantId, dto);
    return { data };
  }
}
