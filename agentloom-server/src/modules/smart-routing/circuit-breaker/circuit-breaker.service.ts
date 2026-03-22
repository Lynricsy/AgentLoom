import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import type { DrizzleDB } from '../../../database/database.module';
import {
  providerHealthStatus,
  type ProviderHealthStatus,
} from '../../../database/schema/provider-health-status.schema';
import type {
  CircuitBreakerKey,
  CircuitBreakerOptions,
  CircuitBreakerSnapshot,
  CircuitBreakerState,
} from './circuit-breaker.types';
import { DEFAULT_CIRCUIT_BREAKER_OPTIONS } from './circuit-breaker.types';

type CircuitBreakerDb = Pick<DrizzleDB, 'select' | 'insert'>;

@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly options: CircuitBreakerOptions;
  private readonly cache = new Map<string, CircuitBreakerState>();
  private readonly persistenceTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: CircuitBreakerDb,
    options?: Partial<CircuitBreakerOptions>,
  ) {
    this.options = {
      ...DEFAULT_CIRCUIT_BREAKER_OPTIONS,
      ...options,
    };

    if (this.options.persistenceIntervalMs > 0) {
      this.persistenceTimer = setInterval(() => {
        void this.flushDirtyEntries();
      }, this.options.persistenceIntervalMs);
      this.persistenceTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
  }

  async recordSuccess(
    tenantId: string,
    provider: string,
    modelId?: string | null,
  ): Promise<CircuitBreakerSnapshot> {
    const state = await this.getOrHydrateState(tenantId, provider, modelId);
    const now = Date.now();
    const phase = this.resolvePhase(state, now);

    if (phase === 'half-open') {
      state.recentResults = [];
      state.lastSuccessAt = now;
      state.circuitOpenedAt = null;
      state.phase = 'closed';
      state.status = 'healthy';
      state.windowStartAt = now;
      state.updatedAt = now;
      state.dirty = true;

      await this.persistIfNeeded(state);
      return this.toSnapshot(state, now);
    }

    state.recentResults.push({ success: true, timestamp: now });
    state.lastSuccessAt = now;
    state.updatedAt = now;
    this.reconcileState(state, now);

    await this.persistIfNeeded(state);
    return this.toSnapshot(state, now);
  }

  async recordFailure(
    tenantId: string,
    provider: string,
    modelId?: string | null,
    _error?: Error,
  ): Promise<CircuitBreakerSnapshot> {
    const state = await this.getOrHydrateState(tenantId, provider, modelId);
    const now = Date.now();
    const phase = this.resolvePhase(state, now);

    state.recentResults.push({ success: false, timestamp: now });
    state.lastFailureAt = now;
    state.updatedAt = now;

    if (phase === 'half-open') {
      state.phase = 'open';
      state.status = 'open';
      state.circuitOpenedAt = now;
      state.windowStartAt = this.calculateWindowStart(state, now);
      state.dirty = true;

      await this.persistIfNeeded(state);
      return this.toSnapshot(state, now);
    }

    this.reconcileState(state, now);

    await this.persistIfNeeded(state);
    return this.toSnapshot(state, now);
  }

  async getStatus(
    tenantId: string,
    provider: string,
    modelId?: string | null,
  ): Promise<CircuitBreakerSnapshot> {
    const state = await this.getOrHydrateState(tenantId, provider, modelId);
    const now = Date.now();

    this.reconcileState(state, now);

    return this.toSnapshot(state, now);
  }

  async listStatuses(
    tenantId: string,
    provider?: string,
    modelId?: string | null,
  ): Promise<CircuitBreakerSnapshot[]> {
    await this.hydrateTenantStates(tenantId);

    const now = Date.now();
    const snapshots = Array.from(this.cache.values())
      .filter((state) => state.tenantId === tenantId)
      .filter((state) => (provider ? state.provider === provider : true))
      .filter((state) =>
        modelId === undefined ? true : state.modelId === (modelId ?? null),
      )
      .map((state) => {
        this.reconcileState(state, now);
        return this.toSnapshot(state, now);
      })
      .sort((left, right) => left.provider.localeCompare(right.provider));

    return snapshots;
  }

  private async getOrHydrateState(
    tenantId: string,
    provider: string,
    modelId?: string | null,
  ): Promise<CircuitBreakerState> {
    const key = this.buildKey({ tenantId, provider, modelId: modelId ?? null });
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    await this.hydrateTenantStates(tenantId);
    const hydrated = this.cache.get(key);
    if (hydrated) {
      return hydrated;
    }

    const empty = this.createEmptyState({
      tenantId,
      provider,
      modelId: modelId ?? null,
    });
    this.cache.set(key, empty);
    return empty;
  }

  private async hydrateTenantStates(tenantId: string): Promise<void> {
    const rows = await this.db.select().from(providerHealthStatus);

    rows
      .filter((row) => row.tenantId === tenantId)
      .forEach((row) => {
        const key = this.buildKey({
          tenantId: row.tenantId,
          provider: row.providerName,
          modelId: row.modelId ?? null,
        });

        if (!this.cache.has(key)) {
          this.cache.set(key, this.deserializeRow(row));
        }
      });
  }

  private deserializeRow(row: ProviderHealthStatus): CircuitBreakerState {
    const fallbackTimestamp =
      row.lastFailureAt?.getTime() ?? row.updatedAt.getTime();
    const recentResults = Array.from({ length: Math.max(row.failureCount, 0) }, () => ({
      success: false,
      timestamp: fallbackTimestamp,
    }));

    return {
      tenantId: row.tenantId,
      provider: row.providerName,
      modelId: row.modelId ?? null,
      status: row.status,
      phase: row.status === 'open' ? 'open' : 'closed',
      recentResults,
      lastFailureAt: row.lastFailureAt?.getTime() ?? null,
      lastSuccessAt: row.lastSuccessAt?.getTime() ?? null,
      circuitOpenedAt: row.circuitOpenedAt?.getTime() ?? null,
      windowStartAt: row.windowStartAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      dirty: false,
    };
  }

  private createEmptyState(key: CircuitBreakerKey): CircuitBreakerState {
    const now = Date.now();

    return {
      ...key,
      status: 'healthy',
      phase: 'closed',
      recentResults: [],
      lastFailureAt: null,
      lastSuccessAt: null,
      circuitOpenedAt: null,
      windowStartAt: now,
      updatedAt: now,
      dirty: false,
    };
  }

  private buildKey(key: CircuitBreakerKey): string {
    return `${key.tenantId}::${key.provider}::${key.modelId ?? '*'}`;
  }

  private reconcileState(state: CircuitBreakerState, now: number): void {
    state.recentResults = this.pruneResults(state.recentResults, now);
    state.windowStartAt = this.calculateWindowStart(state, now);

    const metrics = this.getMetrics(state.recentResults);
    const phase = this.resolvePhase(state, now);

    if (phase === 'half-open') {
      state.phase = 'half-open';
      state.status = 'open';
      state.updatedAt = now;
      return;
    }

    if (phase === 'open') {
      state.phase = 'open';
      state.status = 'open';
      state.updatedAt = now;
      return;
    }

    state.phase = 'closed';
    if (metrics.consecutiveFailureCount >= this.options.consecutiveFailureThreshold) {
      state.status = 'open';
      state.phase = 'open';
      state.circuitOpenedAt = now;
    } else if (
      metrics.totalRequestCount > 0 &&
      metrics.failureRate > this.options.failureRateThreshold
    ) {
      state.status = 'degraded';
    } else {
      state.status = 'healthy';
      if (metrics.failureCount === 0) {
        state.circuitOpenedAt = null;
      }
    }

    state.updatedAt = now;
    state.dirty = true;
  }

  private resolvePhase(
    state: CircuitBreakerState,
    now: number,
  ): 'closed' | 'open' | 'half-open' {
    if (state.phase === 'open' || state.status === 'open') {
      if (
        state.circuitOpenedAt !== null &&
        now - state.circuitOpenedAt >= this.options.recoveryTimeoutMs
      ) {
        state.phase = 'half-open';
        state.updatedAt = now;
        return 'half-open';
      }

      state.phase = 'open';
      return 'open';
    }

    if (state.phase === 'half-open') {
      return 'half-open';
    }

    return 'closed';
  }

  private pruneResults(
    recentResults: CircuitBreakerState['recentResults'],
    now: number,
  ) {
    return recentResults.filter(
      (result) => now - result.timestamp <= this.options.windowMs,
    );
  }

  private calculateWindowStart(state: CircuitBreakerState, now: number): number {
    return state.recentResults[0]?.timestamp ?? now;
  }

  private getMetrics(recentResults: CircuitBreakerState['recentResults']) {
    const totalRequestCount = recentResults.length;
    const failureCount = recentResults.filter((result) => !result.success).length;
    const failureRate = totalRequestCount > 0 ? failureCount / totalRequestCount : 0;

    let consecutiveFailureCount = 0;
    for (let index = recentResults.length - 1; index >= 0; index -= 1) {
      if (recentResults[index]?.success) {
        break;
      }
      consecutiveFailureCount += 1;
    }

    return {
      totalRequestCount,
      failureCount,
      failureRate,
      consecutiveFailureCount,
    };
  }

  private toSnapshot(
    state: CircuitBreakerState,
    now: number,
  ): CircuitBreakerSnapshot {
    const recentResults = this.pruneResults(state.recentResults, now);
    const metrics = this.getMetrics(recentResults);
    const phase = this.resolvePhase(state, now);
    const status = phase === 'half-open' ? 'degraded' : state.status;

    return {
      tenantId: state.tenantId,
      provider: state.provider,
      modelId: state.modelId,
      status,
      phase,
      failureCount: metrics.failureCount,
      totalRequestCount: metrics.totalRequestCount,
      failureRate: metrics.failureRate,
      consecutiveFailureCount: metrics.consecutiveFailureCount,
      lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
      circuitOpenedAt: state.circuitOpenedAt
        ? new Date(state.circuitOpenedAt).toISOString()
        : null,
      windowStartAt: new Date(this.calculateWindowStart(state, now)).toISOString(),
      updatedAt: new Date(state.updatedAt).toISOString(),
    };
  }

  private async persistIfNeeded(state: CircuitBreakerState): Promise<void> {
    if (this.options.persistenceIntervalMs > 0) {
      state.dirty = true;
      return;
    }

    await this.persistState(state);
  }

  private async flushDirtyEntries(): Promise<void> {
    const dirtyEntries = Array.from(this.cache.values()).filter((state) => state.dirty);

    for (const state of dirtyEntries) {
      await this.persistState(state);
    }
  }

  private async persistState(state: CircuitBreakerState): Promise<void> {
    const snapshot = this.toSnapshot(state, Date.now());

    try {
      await this.db.insert(providerHealthStatus).values({
        tenantId: snapshot.tenantId,
        providerName: snapshot.provider,
        modelId: snapshot.modelId,
        status: state.status,
        failureCount: snapshot.failureCount,
        lastFailureAt: snapshot.lastFailureAt
          ? new Date(snapshot.lastFailureAt)
          : null,
        lastSuccessAt: snapshot.lastSuccessAt
          ? new Date(snapshot.lastSuccessAt)
          : null,
        circuitOpenedAt: snapshot.circuitOpenedAt
          ? new Date(snapshot.circuitOpenedAt)
          : null,
        windowStartAt: new Date(snapshot.windowStartAt),
        updatedAt: new Date(snapshot.updatedAt),
      });
      state.dirty = false;
    } catch (error) {
      this.logger.warn(
        `provider_health_status 持久化失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
