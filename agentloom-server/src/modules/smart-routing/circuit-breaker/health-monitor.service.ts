import { Injectable } from '@nestjs/common';

import type { RoutingCandidate } from '../core/routing-candidate';
import { CircuitBreakerService } from './circuit-breaker.service';
import type { CircuitBreakerSnapshot } from './circuit-breaker.types';

@Injectable()
export class HealthMonitorService {
  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  async recordSuccess(
    tenantId: string,
    provider: string,
    modelId: string,
  ): Promise<CircuitBreakerSnapshot> {
    return this.circuitBreaker.recordSuccess(tenantId, provider, modelId);
  }

  async recordFailure(
    tenantId: string,
    provider: string,
    modelId: string,
    error: Error,
  ): Promise<CircuitBreakerSnapshot> {
    return this.circuitBreaker.recordFailure(tenantId, provider, modelId, error);
  }

  async getHealthStatus(
    tenantId: string,
    provider?: string,
    modelId?: string,
  ): Promise<CircuitBreakerSnapshot[]> {
    return this.circuitBreaker.listStatuses(tenantId, provider, modelId);
  }

  async filterHealthyCandidates(
    tenantId: string,
    candidates: RoutingCandidate[],
  ): Promise<RoutingCandidate[]> {
    const evaluated = await Promise.all(
      candidates.map(async (candidate) => {
        const status = await this.circuitBreaker.getStatus(
          tenantId,
          candidate.provider,
          candidate.id,
        );

        return {
          ...candidate,
          healthStatus: status.status,
        } satisfies RoutingCandidate;
      }),
    );

    const healthyCandidates = evaluated.filter(
      (candidate) => candidate.healthStatus !== 'open',
    );

    if (healthyCandidates.length === 0) {
      throw new Error('No healthy routing candidates available');
    }

    return healthyCandidates;
  }
}
