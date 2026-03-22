import type { ProviderHealthState } from '../../../database/schema/provider-health-status.schema';

export const CIRCUIT_BREAKER_OPTIONS = Symbol('CIRCUIT_BREAKER_OPTIONS');

export type CircuitBreakerPhase = 'closed' | 'half-open' | 'open';

export interface CircuitBreakerOptions {
  windowMs: number;
  failureRateThreshold: number;
  consecutiveFailureThreshold: number;
  recoveryTimeoutMs: number;
  persistenceIntervalMs: number;
}

export interface CircuitBreakerResult {
  success: boolean;
  timestamp: number;
}

export interface CircuitBreakerKey {
  tenantId: string;
  provider: string;
  modelId: string | null;
}

export interface CircuitBreakerSnapshot extends CircuitBreakerKey {
  status: ProviderHealthState;
  phase: CircuitBreakerPhase;
  failureCount: number;
  totalRequestCount: number;
  failureRate: number;
  consecutiveFailureCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  circuitOpenedAt: string | null;
  windowStartAt: string;
  updatedAt: string;
}

export interface CircuitBreakerState extends CircuitBreakerKey {
  status: ProviderHealthState;
  phase: CircuitBreakerPhase;
  recentResults: CircuitBreakerResult[];
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  circuitOpenedAt: number | null;
  windowStartAt: number;
  updatedAt: number;
  dirty: boolean;
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  windowMs: 5 * 60 * 1000,
  failureRateThreshold: 0.5,
  consecutiveFailureThreshold: 3,
  recoveryTimeoutMs: 5 * 60 * 1000,
  persistenceIntervalMs: 30 * 1000,
};
