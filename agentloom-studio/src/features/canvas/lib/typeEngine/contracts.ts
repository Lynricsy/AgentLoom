import type {
  CandidateFieldMapping,
  MissingFieldInfo,
  PortDefinition,
  RawCompatibilityLevel,
} from '../../types'
import type { TypeSchema } from '../../types/typeSchema'

export interface SerializedPortDefinition {
  id: string
  label: string
  direction: PortDefinition['direction']
  dataType: PortDefinition['dataType']
  acceptsAnyDataType?: boolean
  description?: string
  required: boolean
  multiple: boolean
  maxConnections: number | null
  schema: TypeSchema
}

export interface TypeEngineCompatibilityMetadata {
  matchedRatio?: number
  matchedRequiredCount?: number
  totalRequiredCount?: number
  unmappedRequiredCount?: number
  [key: string]: unknown
}

export interface TypeEngineCompatibilityResult {
  level: RawCompatibilityLevel
  reason: string | null
  missingFields: MissingFieldInfo[]
  candidateMappings: CandidateFieldMapping[]
  conflictPath: string | null
  transformFn: string | null
  metadata: TypeEngineCompatibilityMetadata
}

export interface TypeEngineWorkerError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface TypeEngineRuntimeState {
  wasmReady: boolean
  workerBusy: boolean
  lastError: TypeEngineWorkerError | null
}

export type TypeEngineWasmLoadStrategy = 'streaming' | 'arrayBuffer'

export interface TypeEngineBindings {
  loadStrategy: TypeEngineWasmLoadStrategy
  checkCompatibility: (
    source: SerializedPortDefinition,
    target: SerializedPortDefinition,
  ) => TypeEngineCompatibilityResult
}

export type TypeEngineWorkerRequest =
  | {
      kind: 'init'
      requestId: string
    }
  | {
      kind: 'checkCompatibility'
      requestId: string
      source: SerializedPortDefinition
      target: SerializedPortDefinition
    }

export type TypeEngineWorkerResponse =
  | {
      kind: 'init'
      requestId: string
      ok: true
      payload: {
        loadStrategy: TypeEngineWasmLoadStrategy
      }
    }
  | {
      kind: 'checkCompatibility'
      requestId: string
      ok: true
      payload: TypeEngineCompatibilityResult
    }
  | {
      kind: TypeEngineWorkerRequest['kind']
      requestId: string
      ok: false
      error: TypeEngineWorkerError
    }

export interface TypeEngineDiagnosticContext {
  sourceNodeId?: string
  sourcePortId?: string
  targetNodeId?: string
  targetPortId?: string
  sourceSignature?: string
  targetSignature?: string
}

export interface TypeEngineServiceLike {
  warmup: () => Promise<void>
  getCachedCompatibility: (
    sourcePort: PortDefinition,
    targetPort: PortDefinition,
  ) => TypeEngineCompatibilityResult | null
  evaluateCompatibility: (
    sourcePort: PortDefinition,
    targetPort: PortDefinition,
    context?: TypeEngineDiagnosticContext,
  ) => Promise<TypeEngineCompatibilityResult>
  getRuntimeState: () => TypeEngineRuntimeState
}
