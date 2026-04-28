import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  GeneratedAppController,
  GeneratedAppPublicController,
} from './generated-app.controller';
import { GeneratedAppService } from './generated-app.service';
import { GeneratedAppGate4IntegrationRunner } from './generated-app.integration-runner';
import { GeneratedAppGate3WorkspaceRunner } from './generated-app.workspace';

@Module({
  imports: [ConfigModule],
  controllers: [GeneratedAppController, GeneratedAppPublicController],
  providers: [
    GeneratedAppService,
    GeneratedAppGate3WorkspaceRunner,
    GeneratedAppGate4IntegrationRunner,
  ],
  exports: [GeneratedAppService],
})
export class GeneratedAppModule {}
