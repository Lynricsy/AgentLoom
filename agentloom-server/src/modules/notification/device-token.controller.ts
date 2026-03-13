import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { DeviceTokenService } from './device-token.service';

@ApiTags('Devices')
@UseGuards(AuthGuard)
@Controller('devices')
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post('register')
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
  async unregister(
    @CurrentUser('sub') userId: string,
    @Body() dto: UnregisterDeviceDto,
  ) {
    await this.deviceTokenService.unregister(userId, dto.deviceToken);

    return { status: 'ok' as const };
  }
}
