import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AGENT_TASK_QUEUE } from '../execution/execution.constants';
import { ResourceGovernanceModule } from '../resource-governance/resource-governance.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [
    DatabaseModule,
    ResourceGovernanceModule,
    BullModule.registerQueue({ name: AGENT_TASK_QUEUE }),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
