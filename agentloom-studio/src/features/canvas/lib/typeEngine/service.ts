import type { PortDefinition } from '../../types/nodeTypeRegistry'
import type {
  TypeEngineCompatibilityResult,
  TypeEngineDiagnosticContext,
  TypeEngineRuntimeState,
  TypeEngineServiceLike,
} from './contracts'
import { evaluateCompatibilityFallback } from './fallback'
import { getCompatibilityCacheKey, getPortContractSignature, serializePortDefinition } from './serialize'
import { getTypeEngineRuntime, type TypeEngineRuntime } from './runtime'

function logFallback(
  error: unknown,
  context: TypeEngineDiagnosticContext | undefined,
  sourcePort: PortDefinition,
  targetPort: PortDefinition,
) {
  console.warn('TypeEngine runtime unavailable, falling back to local compatibility evaluator.', {
    error,
    sourceNodeId: context?.sourceNodeId,
    sourcePortId: context?.sourcePortId ?? sourcePort.id,
    targetNodeId: context?.targetNodeId,
    targetPortId: context?.targetPortId ?? targetPort.id,
    sourceSignature: context?.sourceSignature ?? getPortContractSignature(sourcePort),
    targetSignature: context?.targetSignature ?? getPortContractSignature(targetPort),
  })
}

export class TypeEngineService implements TypeEngineServiceLike {
  constructor(private readonly runtime: TypeEngineRuntime = getTypeEngineRuntime()) {}

  async warmup(): Promise<void> {
    try {
      await this.runtime.ensureReady()
    } catch (error) {
      console.warn('TypeEngine runtime warmup failed.', { error })
    }
  }

  getCachedCompatibility(
    sourcePort: PortDefinition,
    targetPort: PortDefinition,
  ): TypeEngineCompatibilityResult | null {
    return this.runtime.getCachedResult(getCompatibilityCacheKey(sourcePort, targetPort))
  }

  async evaluateCompatibility(
    sourcePort: PortDefinition,
    targetPort: PortDefinition,
    context?: TypeEngineDiagnosticContext,
  ): Promise<TypeEngineCompatibilityResult> {
    const sourceSignature = context?.sourceSignature ?? getPortContractSignature(sourcePort)
    const targetSignature = context?.targetSignature ?? getPortContractSignature(targetPort)

    try {
      return await this.runtime.checkCompatibility(
        `${sourceSignature}=>${targetSignature}`,
        serializePortDefinition(sourcePort),
        serializePortDefinition(targetPort),
      )
    } catch (error) {
      logFallback(error, { ...context, sourceSignature, targetSignature }, sourcePort, targetPort)
      return evaluateCompatibilityFallback(sourcePort, targetPort)
    }
  }

  getRuntimeState(): TypeEngineRuntimeState {
    return this.runtime.getState()
  }
}

let typeEngineServiceSingleton: TypeEngineServiceLike | null = null

export function getTypeEngineService(): TypeEngineServiceLike {
  typeEngineServiceSingleton ??= new TypeEngineService()
  return typeEngineServiceSingleton
}

export function setTypeEngineServiceForTesting(service: TypeEngineServiceLike | null) {
  typeEngineServiceSingleton = service
}
