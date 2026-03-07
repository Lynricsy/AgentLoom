import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowVersionService } from './workflow-version.service';

@Module({
  imports: [ConfigModule],
  controllers: [WorkflowVersionController],
  providers: [WorkflowVersionService],
  exports: [WorkflowVersionService],
})
export class WorkflowDefinitionModule {}
