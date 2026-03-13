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
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('notifications')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
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
