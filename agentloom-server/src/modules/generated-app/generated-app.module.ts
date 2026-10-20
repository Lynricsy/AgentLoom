import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from '../agent/agent.module';
import { ExecutionModule } from '../execution/execution.module';
import { LlmModule } from '../llm/llm.module';
import { WorkflowDefinitionModule } from '../workflow-definition/workflow-definition.module';
import {
  GeneratedAppController,
  GeneratedAppPublicController,
} from './generated-app.controller';
import { GeneratedAppService } from './generated-app.service';
import { GeneratedAppRepository } from './generated-app.repository';
import { GeneratedAppGenerationRepairService } from './generated-app-generation-repair.service';
import { GeneratedAppArtifactService } from './generated-app-artifact.service';
import { GeneratedAppPublicRuntimeService } from './generated-app-public-runtime.service';
import { GeneratedAppRuntimeBindingService } from './generated-app-runtime-binding.service';
import { GeneratedAppBindingResolverService } from './generated-app-binding-resolver.service';
import { GeneratedAppGate0Service } from './generated-app-gate0.service';
import { GeneratedAppSpecGeneratorService } from './generated-app-spec-generator.service';
import { GeneratedAppBrowserAcceptanceDispatcher } from './generated-app-browser-acceptance.dispatcher';
import { GeneratedAppGate3WorkspaceRunner } from './generated-app.gate3-workspace';
import { GeneratedAppGate4IntegrationRunner } from './generated-app.gate4-integration';
import { GeneratedAppGate5BrowserAcceptance } from './generated-app.gate5-browser-acceptance';
import { GeneratedAppGate6IndependentVerifierRunner } from './generated-app.gate6-independent-verifier';
import { GeneratedAppGate7PublishCandidateRunner } from './generated-app.gate7-publish-candidate';
import { generatedAppRuntimeFormBuilder } from './generated-app.runtime';
import { GeneratedAppGenerationPipelineService } from './generated-app-generation-pipeline.service';
import { GeneratedAppGenerationWorker } from './generated-app-generation.worker';
import {
  GENERATED_APP_GENERATION_QUEUE,
  generatedAppGenerationJobOptions,
} from './generated-app-generation.constants';
import {
  GENERATED_APP_AGENT_WRAPPER_BUILDER,
  GENERATED_APP_BINDING_RESOLVER,
  GENERATED_APP_GATE0_EVALUATOR,
  GENERATED_APP_GATE5_RUNNER,
  GENERATED_APP_RUNTIME_BINDING_ADAPTER,
  GENERATED_APP_RUNTIME_FORM_BUILDER,
} from './generated-app.v2-tokens';
import { GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE } from './types/browser-acceptance-job.schema';

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    ExecutionModule,
    LlmModule,
    WorkflowDefinitionModule,
    BullModule.registerQueue({
      name: GENERATED_APP_GENERATION_QUEUE,
      defaultJobOptions: generatedAppGenerationJobOptions,
    }),
    BullModule.registerQueue({ name: GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE }),
  ],
  controllers: [GeneratedAppController, GeneratedAppPublicController],
  providers: [
    GeneratedAppService,
    GeneratedAppRepository,
    GeneratedAppGenerationRepairService,
    GeneratedAppArtifactService,
    GeneratedAppPublicRuntimeService,
    GeneratedAppRuntimeBindingService,
    GeneratedAppBindingResolverService,
    GeneratedAppSpecGeneratorService,
    GeneratedAppGate0Service,
    GeneratedAppBrowserAcceptanceDispatcher,
    GeneratedAppGate3WorkspaceRunner,
    GeneratedAppGate4IntegrationRunner,
    GeneratedAppGate5BrowserAcceptance,
    GeneratedAppGate6IndependentVerifierRunner,
    GeneratedAppGate7PublishCandidateRunner,
    GeneratedAppGenerationPipelineService,
    GeneratedAppGenerationWorker,
    {
      provide: GENERATED_APP_GATE0_EVALUATOR,
      useExisting: GeneratedAppGate0Service,
    },
    {
      provide: GENERATED_APP_BINDING_RESOLVER,
      useExisting: GeneratedAppBindingResolverService,
    },
    {
      provide: GENERATED_APP_RUNTIME_FORM_BUILDER,
      useValue: generatedAppRuntimeFormBuilder,
    },
    {
      provide: GENERATED_APP_RUNTIME_BINDING_ADAPTER,
      useExisting: GeneratedAppRuntimeBindingService,
    },
    {
      provide: GENERATED_APP_AGENT_WRAPPER_BUILDER,
      useExisting: GeneratedAppRuntimeBindingService,
    },
    {
      provide: GENERATED_APP_GATE5_RUNNER,
      useExisting: GeneratedAppGate5BrowserAcceptance,
    },
  ],
  exports: [GeneratedAppService],
})
export class GeneratedAppModule {}
