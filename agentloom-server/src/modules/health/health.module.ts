import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [DiscoveryModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
