import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
@SkipThrottle({ default: true })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: '存活检查（liveness）',
    description:
      '不检查 PostgreSQL 与 Redis，依赖中断时仍返回 200；只有 Redis 可用但队列 worker 持续 2 分钟以上无法取任务时返回 503，提示需要重启进程。',
  })
  @ApiResponse({ status: 200, description: '进程存活' })
  @ApiResponse({ status: 503, description: '队列 worker 卡死，需要重启' })
  async check() {
    await this.healthService.checkLiveness();
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @ApiOperation({
    summary: '就绪检查（readiness）',
    description:
      'PostgreSQL、Redis 与全部队列 worker 都可用时返回 200；任一不可用返回 503 problem+json，checks 字段给出各项状态。',
  })
  @ApiResponse({ status: 200, description: '可以接收请求与任务' })
  @ApiResponse({ status: 503, description: '依赖不可用' })
  async ready() {
    const checks = await this.healthService.checkReadiness();
    return { status: 'ok', timestamp: new Date().toISOString(), checks };
  }
}
