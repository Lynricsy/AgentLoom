import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OrganizationModule } from '../organization/organization.module';
import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { ShareModule } from '../share/share.module';
import { TemplateModule } from '../template/template.module';
import { WorkflowDefinitionCreateController } from './workflow-definition-create.controller';
import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowVersionService } from './workflow-version.service';
import { WorkflowDefinitionRepository } from './workflow-definition.repository';
import { WorkflowImportService } from './workflow-import.service';
import { WorkflowImportSourceResolverService } from './workflow-import-source-resolver.service';
import { WorkflowPublishService } from './workflow-publish.service';
import { WorkflowVersionRepository } from './workflow-version.repository';

@Module({
  imports: [
    ConfigModule,
    TemplateModule,
    ShareModule,
    OrganizationModule,
    ResourceSourceModule,
  ],
  controllers: [WorkflowDefinitionCreateController, WorkflowVersionController],
  providers: [
    WorkflowDefinitionRepository,
    WorkflowVersionRepository,
    WorkflowImportSourceResolverService,
    WorkflowImportService,
    WorkflowPublishService,
    WorkflowVersionService,
  ],
  exports: [WorkflowVersionService],
})
export class WorkflowDefinitionModule {}
