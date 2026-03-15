import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
@SkipThrottle({ default: true })
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: '健康检查' })
  @ApiResponse({ status: 200, description: '服务健康状态' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
