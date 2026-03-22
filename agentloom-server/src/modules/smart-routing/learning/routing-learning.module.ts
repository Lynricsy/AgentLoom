import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DRIZZLE } from '../../../database/database.module';
import { qdrantClientProvider } from '../../knowledge/qdrant.provider';
import { EmbeddingModule } from '../embedding/embedding.module';
import { EmbeddingIntegrationService } from '../embedding/embedding.service';
import { MlpTrainerService } from './mlp-trainer.service';
import { RoutingLearningProducer } from './routing-learning.producer';
import {
  DEFAULT_ROUTING_LEARNING_CONFIG,
  ROUTING_LEARNING_CONFIG_TOKEN,
  ROUTING_LEARNING_QUEUE,
  ROUTING_LEARNING_QUEUE_DEFAULT_JOB_OPTIONS,
} from './routing-learning.types';
import { RoutingLearningWorker } from './routing-learning.worker';

@Module({
  imports: [
    ConfigModule,
    EmbeddingModule,
    BullModule.registerQueue({
      name: ROUTING_LEARNING_QUEUE,
      defaultJobOptions: ROUTING_LEARNING_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
  ],
  providers: [
    {
      provide: ROUTING_LEARNING_CONFIG_TOKEN,
      useValue: DEFAULT_ROUTING_LEARNING_CONFIG,
    },
    qdrantClientProvider,
    RoutingLearningProducer,
    {
      provide: MlpTrainerService,
      useFactory: (
        db: ConstructorParameters<typeof MlpTrainerService>[0],
        config?: ConstructorParameters<typeof MlpTrainerService>[1],
      ) => new MlpTrainerService(db, config),
      inject: [
        DRIZZLE,
        { token: ROUTING_LEARNING_CONFIG_TOKEN, optional: true },
      ],
    },
    {
      provide: RoutingLearningWorker,
      useFactory: (
        db: ConstructorParameters<typeof RoutingLearningWorker>[0],
        embeddingService: EmbeddingIntegrationService,
        qdrantClient: ConstructorParameters<typeof RoutingLearningWorker>[2],
        mlpTrainerService: MlpTrainerService,
        config?: ConstructorParameters<typeof RoutingLearningWorker>[4],
      ) =>
        new RoutingLearningWorker(
          db,
          embeddingService,
          qdrantClient,
          mlpTrainerService,
          config,
        ),
      inject: [
        DRIZZLE,
        EmbeddingIntegrationService,
        qdrantClientProvider.provide,
        MlpTrainerService,
        { token: ROUTING_LEARNING_CONFIG_TOKEN, optional: true },
      ],
    },
  ],
  exports: [RoutingLearningProducer, MlpTrainerService],
})
export class RoutingLearningModule {}
