import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('notifications')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取当前用户的通知列表' })
  @ApiResponse({ status: 200, description: '通知列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const result = await this.notificationService.findAll(
      tenantId,
      userId,
      query,
    );

    return {
      data: result.data,
      page: result.meta.page,
      limit: result.meta.pageSize,
      total: result.meta.total,
      totalPages: result.meta.totalPages,
      meta: result.meta,
    };
  }

  @Get('notifications/unread-count')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取当前用户的未读通知数量' })
  @ApiResponse({ status: 200, description: '未读通知数量获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getUnreadCount(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.notificationService.getUnreadCount(tenantId, userId),
    };
  }

  @Patch('notifications/read-all')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '将所有通知标记为已读' })
  @ApiResponse({ status: 200, description: '全部通知标记已读成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async markAllAsRead(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.notificationService.markAllAsRead(tenantId, userId),
    };
  }

  @Patch('notifications/:id/read')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '将指定通知标记为已读' })
  @ApiParam({ name: 'id', description: '通知 ID', type: String })
  @ApiResponse({ status: 200, description: '通知标记已读成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 404, description: '通知不存在' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) notificationId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.notificationService.markAsRead(
        tenantId,
        userId,
        notificationId,
      ),
    };
  }

  @Get('notifications/preferences')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取当前用户的通知偏好设置' })
  @ApiResponse({ status: 200, description: '通知偏好设置获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getPreferences(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.notificationService.getPreferences(tenantId, userId),
    };
  }

  @Put('notifications/preferences')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '创建或更新通知偏好设置' })
  @ApiResponse({ status: 200, description: '通知偏好设置保存成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  async upsertPreference(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpsertPreferenceDto,
  ) {
    return {
      data: await this.notificationService.upsertPreference(
        tenantId,
        userId,
        dto,
      ),
    };
  }
}
