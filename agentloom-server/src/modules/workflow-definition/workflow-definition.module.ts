import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TemplateModule } from '../template/template.module';
import { WorkflowDefinitionCreateController } from './workflow-definition-create.controller';
import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowVersionService } from './workflow-version.service';

@Module({
  imports: [ConfigModule, TemplateModule],
  controllers: [WorkflowDefinitionCreateController, WorkflowVersionController],
  providers: [WorkflowVersionService],
  exports: [WorkflowVersionService],
})
export class WorkflowDefinitionModule {}
