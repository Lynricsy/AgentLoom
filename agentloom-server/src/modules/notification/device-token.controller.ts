import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { DeviceTokenService } from './device-token.service';

@ApiTags('Device Tokens')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@UseGuards(AuthGuard)
@Controller('devices')
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post('register')
  @ApiOperation({ summary: '注册设备推送令牌' })
  @ApiResponse({ status: 201, description: '设备令牌注册成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  async register(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    await this.deviceTokenService.register(
      userId,
      dto.deviceToken,
      dto.platform,
    );

    return { status: 'ok' as const };
  }

  @Delete('unregister')
  @ApiOperation({ summary: '注销设备推送令牌' })
  @ApiResponse({ status: 200, description: '设备令牌注销成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  async unregister(
    @CurrentUser('sub') userId: string,
    @Body() dto: UnregisterDeviceDto,
  ) {
    await this.deviceTokenService.unregister(userId, dto.deviceToken);

    return { status: 'ok' as const };
  }
}
