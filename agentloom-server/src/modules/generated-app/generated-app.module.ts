import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ExecutionModule } from '../execution/execution.module';
import { PluginModule } from '../plugin/plugin.module';
import {
  GeneratedAppController,
  GeneratedAppPublicController,
} from './generated-app.controller';
import { GeneratedAppService } from './generated-app.service';
import { GeneratedAppGate5BrowserAcceptanceRunner } from './generated-app.browser-acceptance-runner';
import { GeneratedAppGate6IndependentVerifierRunner } from './generated-app.independent-verifier-runner';
import { GeneratedAppGate4IntegrationRunner } from './generated-app.integration-runner';
import { GeneratedAppGate7PublishCandidateRunner } from './generated-app.publish-candidate-runner';
import { GeneratedAppGate3WorkspaceRunner } from './generated-app.workspace';

@Module({
  imports: [ConfigModule, ExecutionModule, PluginModule],
  controllers: [GeneratedAppController, GeneratedAppPublicController],
  providers: [
    GeneratedAppService,
    GeneratedAppGate3WorkspaceRunner,
    GeneratedAppGate4IntegrationRunner,
    GeneratedAppGate5BrowserAcceptanceRunner,
    GeneratedAppGate6IndependentVerifierRunner,
    GeneratedAppGate7PublishCandidateRunner,
  ],
  exports: [GeneratedAppService],
})
export class GeneratedAppModule {}
