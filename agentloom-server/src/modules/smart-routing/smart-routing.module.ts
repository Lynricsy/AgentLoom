import type { QdrantClient } from '@qdrant/js-client-rest';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { QDRANT_CLIENT, qdrantClientProvider } from '../knowledge/qdrant.provider';
import { LlmModule } from '../llm/llm.module';
import { PluginModule } from '../plugin/plugin.module';
import { PluginSandboxService } from '../plugin/plugin-sandbox.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { HealthMonitorService } from './circuit-breaker/health-monitor.service';
import { BaseRouterStrategy, type RouterCategory } from './core/base-router-strategy';
import type { RoutingCandidate } from './core/routing-candidate';
import type { RoutingContext } from './core/routing-context';
import type { RoutingDecision } from './core/routing-decision';
import { RouterRegistry } from './core/router-registry';
import { EmbeddingModule } from './embedding/embedding.module';
import { EmbeddingIntegrationService } from './embedding/embedding.service';
import { RoutingLearningModule } from './learning/routing-learning.module';
import { ROUTING_LEARNING_QUEUE } from './learning/routing-learning.types';
import { SmartRoutingController } from './smart-routing.controller';
import { SmartRoutingService } from './smart-routing.service';
import { CostOptimizedRouter } from './strategies/cost-optimized.strategy';
import { FallbackChainRouter } from './strategies/fallback-chain.strategy';
import { HistoricalBestRouter } from './strategies/historical-best.strategy';
import { LatencyFirstRouter } from './strategies/latency-first.strategy';
import { LlmAsRouterStrategy } from './strategies/llm-as-router.strategy';
import { KnnRouter } from './strategies/ml/knn.strategy';
import { EloRouter } from './strategies/ml/elo.strategy';
import { MemoryBankRouter } from './strategies/ml/memory-bank.strategy';
import { MlpRouter } from './strategies/ml/mlp.strategy';
import { QualityFirstRouter } from './strategies/quality-first.strategy';
import { RandomRouter } from './strategies/random.strategy';
import { RoundRobinRouter } from './strategies/round-robin.strategy';
import { RulesRouter } from './strategies/rules.strategy';
import { TokenOptimizedRouter } from './strategies/token-optimized.strategy';
import { WasmPluginRouter } from './strategies/wasm-plugin.strategy';

type RoutingSelectDb = Pick<DrizzleDB, 'select'>;
type CircuitBreakerDb = Pick<DrizzleDB, 'select' | 'insert'>;
type RoutingQdrantClient = Pick<QdrantClient, 'search'>;

class MemoryBankAliasRouter extends BaseRouterStrategy {
  readonly name = 'memory_bank';

  readonly category: RouterCategory;

  readonly requiresEmbedding: boolean;

  readonly configSchema;

  constructor(private readonly delegate: MemoryBankRouter) {
    super();
    this.category = delegate.category;
    this.requiresEmbedding = delegate.requiresEmbedding;
    this.configSchema = delegate.configSchema;
  }

  routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    return this.delegate.routeSingle(candidates, context);
  }
}

class WasmPluginAliasRouter extends BaseRouterStrategy {
  readonly name = 'wasm_plugin';

  readonly category: RouterCategory;

  readonly requiresEmbedding: boolean;

  readonly configSchema;

  constructor(private readonly delegate: WasmPluginRouter) {
    super();
    this.category = delegate.category;
    this.requiresEmbedding = delegate.requiresEmbedding;
    this.configSchema = delegate.configSchema;
  }

  routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    return this.delegate.routeSingle(candidates, context);
  }
}

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: ROUTING_LEARNING_QUEUE }),
    LlmModule,
    EmbeddingModule,
    RoutingLearningModule,
    PluginModule,
  ],
  controllers: [SmartRoutingController],
  providers: [
    qdrantClientProvider,
    {
      provide: CircuitBreakerService,
      useFactory: (db: CircuitBreakerDb) => new CircuitBreakerService(db),
      inject: [DRIZZLE],
    },
    HealthMonitorService,
    {
      provide: RandomRouter,
      useFactory: () => new RandomRouter(),
    },
    {
      provide: RoundRobinRouter,
      useFactory: () => new RoundRobinRouter(),
    },
    {
      provide: RulesRouter,
      useFactory: () => new RulesRouter(),
    },
    {
      provide: LlmAsRouterStrategy,
      useFactory: () => new LlmAsRouterStrategy(),
    },
    {
      provide: KnnRouter,
      useFactory: (
        db: RoutingSelectDb,
        qdrantClient: RoutingQdrantClient,
        embeddingService: EmbeddingIntegrationService,
      ) => new KnnRouter(db, qdrantClient, embeddingService),
      inject: [DRIZZLE, QDRANT_CLIENT, EmbeddingIntegrationService],
    },
    {
      provide: MlpRouter,
      useFactory: (
        db: RoutingSelectDb,
        embeddingService: EmbeddingIntegrationService,
      ) => new MlpRouter(db, embeddingService),
      inject: [DRIZZLE, EmbeddingIntegrationService],
    },
    {
      provide: EloRouter,
      useFactory: (db: RoutingSelectDb) => new EloRouter(db),
      inject: [DRIZZLE],
    },
    {
      provide: MemoryBankAliasRouter,
      useFactory: (
        db: RoutingSelectDb,
        qdrantClient: RoutingQdrantClient,
        embeddingService: EmbeddingIntegrationService,
      ) =>
        new MemoryBankAliasRouter(
          new MemoryBankRouter(db, qdrantClient, embeddingService),
        ),
      inject: [DRIZZLE, QDRANT_CLIENT, EmbeddingIntegrationService],
    },
    {
      provide: FallbackChainRouter,
      useFactory: () => new FallbackChainRouter(),
    },
    {
      provide: WasmPluginAliasRouter,
      useFactory: (pluginSandboxService: PluginSandboxService) =>
        new WasmPluginAliasRouter(
          new WasmPluginRouter(pluginSandboxService, Buffer.alloc(0), {
            pluginId: 'smart-routing-wasm-plugin',
          }),
        ),
      inject: [PluginSandboxService],
    },
    {
      provide: TokenOptimizedRouter,
      useFactory: () => new TokenOptimizedRouter(),
    },
    {
      provide: CostOptimizedRouter,
      useFactory: () => new CostOptimizedRouter(),
    },
    {
      provide: QualityFirstRouter,
      useFactory: () => new QualityFirstRouter(),
    },
    {
      provide: LatencyFirstRouter,
      useFactory: () => new LatencyFirstRouter(),
    },
    {
      provide: HistoricalBestRouter,
      useFactory: () => new HistoricalBestRouter(),
    },
    {
      provide: RouterRegistry,
      useFactory: (
        randomRouter: RandomRouter,
        roundRobinRouter: RoundRobinRouter,
        rulesRouter: RulesRouter,
        llmAsRouter: LlmAsRouterStrategy,
        knnRouter: KnnRouter,
        mlpRouter: MlpRouter,
        eloRouter: EloRouter,
        memoryBankRouter: MemoryBankAliasRouter,
        fallbackChainRouter: FallbackChainRouter,
        wasmPluginRouter: WasmPluginAliasRouter,
        tokenOptimizedRouter: TokenOptimizedRouter,
        costOptimizedRouter: CostOptimizedRouter,
        qualityFirstRouter: QualityFirstRouter,
        latencyFirstRouter: LatencyFirstRouter,
        historicalBestRouter: HistoricalBestRouter,
      ) => {
        const registry = new RouterRegistry();
        [
          randomRouter,
          roundRobinRouter,
          rulesRouter,
          llmAsRouter,
          knnRouter,
          mlpRouter,
          eloRouter,
          memoryBankRouter,
          fallbackChainRouter,
          wasmPluginRouter,
          tokenOptimizedRouter,
          costOptimizedRouter,
          qualityFirstRouter,
          latencyFirstRouter,
          historicalBestRouter,
        ].forEach((router) => {
          registry.register(router);
        });

        return registry;
      },
      inject: [
        RandomRouter,
        RoundRobinRouter,
        RulesRouter,
        LlmAsRouterStrategy,
        KnnRouter,
        MlpRouter,
        EloRouter,
        MemoryBankAliasRouter,
        FallbackChainRouter,
        WasmPluginAliasRouter,
        TokenOptimizedRouter,
        CostOptimizedRouter,
        QualityFirstRouter,
        LatencyFirstRouter,
        HistoricalBestRouter,
      ],
    },
    SmartRoutingService,
  ],
  exports: [
    SmartRoutingService,
    RouterRegistry,
    CircuitBreakerService,
    HealthMonitorService,
    EmbeddingModule,
    RoutingLearningModule,
  ],
})
export class SmartRoutingModule {}
