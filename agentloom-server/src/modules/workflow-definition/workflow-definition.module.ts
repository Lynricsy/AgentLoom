import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OrganizationModule } from '../organization/organization.module';
import { ShareModule } from '../share/share.module';
import { TemplateModule } from '../template/template.module';
import { WorkflowDefinitionCreateController } from './workflow-definition-create.controller';
import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowVersionService } from './workflow-version.service';

@Module({
  imports: [ConfigModule, TemplateModule, ShareModule, OrganizationModule],
  controllers: [WorkflowDefinitionCreateController, WorkflowVersionController],
  providers: [WorkflowVersionService],
  exports: [WorkflowVersionService],
})
export class WorkflowDefinitionModule {}
