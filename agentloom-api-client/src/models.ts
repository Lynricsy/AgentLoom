/* tslint:disable */
/* eslint-disable */
/**
 * 
 * @export
 * @interface AddGlossaryKeywordDto
 */
export interface AddGlossaryKeywordDto {
    /**
     * 
     * @type {string}
     * @memberof AddGlossaryKeywordDto
     */
    keyword: string;
}
/**
 * 
 * @export
 * @interface ChangePasswordDto
 */
export interface ChangePasswordDto {
    /**
     * 
     * @type {string}
     * @memberof ChangePasswordDto
     */
    currentPassword: string;
    /**
     * 
     * @type {string}
     * @memberof ChangePasswordDto
     */
    newPassword: string;
}
/**
 * 
 * @export
 * @interface CreateApiKeyDto
 */
export interface CreateApiKeyDto {
    /**
     * 
     * @type {string}
     * @memberof CreateApiKeyDto
     */
    provider: CreateApiKeyDtoProviderEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateApiKeyDto
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof CreateApiKeyDto
     */
    apiKey: string;
    /**
     * 
     * @type {boolean}
     * @memberof CreateApiKeyDto
     */
    isDefault?: boolean;
}


/**
 * @export
 */
export const CreateApiKeyDtoProviderEnum = {
    Openai: 'openai',
    Anthropic: 'anthropic',
    Google: 'google',
    AzureOpenai: 'azure-openai',
    Cohere: 'cohere',
    Mistral: 'mistral',
    Deepseek: 'deepseek',
    Groq: 'groq'
} as const;
export type CreateApiKeyDtoProviderEnum = typeof CreateApiKeyDtoProviderEnum[keyof typeof CreateApiKeyDtoProviderEnum];

/**
 * 
 * @export
 * @interface CreateConversationDto
 */
export interface CreateConversationDto {
    /**
     * 
     * @type {string}
     * @memberof CreateConversationDto
     */
    title?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateConversationDto
     */
    metadata?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface CreateEvidenceExportJobBodyDto
 */
export interface CreateEvidenceExportJobBodyDto {
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    workflowId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    executionId?: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    executionIds?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    resourceType?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    resourceId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    eventType?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    actorType?: CreateEvidenceExportJobBodyDtoActorTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    actorId?: string;
    /**
     * 
     * @type {boolean}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    includeAuditMetadata?: boolean;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    from?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateEvidenceExportJobBodyDto
     */
    to?: string;
}


/**
 * @export
 */
export const CreateEvidenceExportJobBodyDtoActorTypeEnum = {
    User: 'user',
    System: 'system',
    Service: 'service'
} as const;
export type CreateEvidenceExportJobBodyDtoActorTypeEnum = typeof CreateEvidenceExportJobBodyDtoActorTypeEnum[keyof typeof CreateEvidenceExportJobBodyDtoActorTypeEnum];

/**
 * 
 * @export
 * @interface CreateGeneratedAppDto
 */
export interface CreateGeneratedAppDto {
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppDto
     */
    prompt: string;
}
/**
 * 
 * @export
 * @interface CreateGeneratedAppGateRunDto
 */
export interface CreateGeneratedAppGateRunDto {
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    gateId: CreateGeneratedAppGateRunDtoGateIdEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    generationRunId?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    repairAttemptId?: string | null;
    /**
     * 
     * @type {number}
     * @memberof CreateGeneratedAppGateRunDto
     */
    attemptNumber?: number;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    status: CreateGeneratedAppGateRunDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    summary: string;
    /**
     * 
     * @type {Array<CreateGeneratedAppGateRunDtoEvidenceInner>}
     * @memberof CreateGeneratedAppGateRunDto
     */
    evidence?: Array<CreateGeneratedAppGateRunDtoEvidenceInner>;
    /**
     * 
     * @type {CreateGeneratedAppGateRunDtoFailure}
     * @memberof CreateGeneratedAppGateRunDto
     */
    failure?: CreateGeneratedAppGateRunDtoFailure | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    repairInstructions?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    startedAt?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDto
     */
    completedAt?: string | null;
}


/**
 * @export
 */
export const CreateGeneratedAppGateRunDtoGateIdEnum = {
    _0: 'gate-0',
    _1: 'gate-1',
    _2: 'gate-2',
    _3: 'gate-3',
    _4: 'gate-4',
    _5: 'gate-5',
    _6: 'gate-6',
    _7: 'gate-7'
} as const;
export type CreateGeneratedAppGateRunDtoGateIdEnum = typeof CreateGeneratedAppGateRunDtoGateIdEnum[keyof typeof CreateGeneratedAppGateRunDtoGateIdEnum];

/**
 * @export
 */
export const CreateGeneratedAppGateRunDtoStatusEnum = {
    Running: 'running',
    Passed: 'passed',
    Failed: 'failed',
    Warning: 'warning',
    Skipped: 'skipped'
} as const;
export type CreateGeneratedAppGateRunDtoStatusEnum = typeof CreateGeneratedAppGateRunDtoStatusEnum[keyof typeof CreateGeneratedAppGateRunDtoStatusEnum];

/**
 * 
 * @export
 * @interface CreateGeneratedAppGateRunDtoEvidenceInner
 */
export interface CreateGeneratedAppGateRunDtoEvidenceInner {
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    kind: CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    url?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    summary: string;
    /**
     * 
     * @type {any}
     * @memberof CreateGeneratedAppGateRunDtoEvidenceInner
     */
    details?: any | null;
}


/**
 * @export
 */
export const CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum = {
    AppSpec: 'app_spec',
    Plan: 'plan',
    StaticCheck: 'static_check',
    Build: 'build',
    Test: 'test',
    Browser: 'browser',
    Verifier: 'verifier',
    Manual: 'manual'
} as const;
export type CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum = typeof CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum[keyof typeof CreateGeneratedAppGateRunDtoEvidenceInnerKindEnum];

/**
 * 
 * @export
 * @interface CreateGeneratedAppGateRunDtoFailure
 */
export interface CreateGeneratedAppGateRunDtoFailure {
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoFailure
     */
    code?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGateRunDtoFailure
     */
    message: string;
    /**
     * 
     * @type {any}
     * @memberof CreateGeneratedAppGateRunDtoFailure
     */
    details?: any | null;
}
/**
 * 
 * @export
 * @interface CreateGeneratedAppGenerationRunDto
 */
export interface CreateGeneratedAppGenerationRunDto {
    /**
     * 
     * @type {number}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    runNumber?: number;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    status?: CreateGeneratedAppGenerationRunDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    triggerSource?: CreateGeneratedAppGenerationRunDtoTriggerSourceEnum;
    /**
     * 
     * @type {number}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    maxRepairAttempts?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    maxRuntimeSeconds?: number;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    summary: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    failureReason?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    startedAt?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppGenerationRunDto
     */
    completedAt?: string | null;
}


/**
 * @export
 */
export const CreateGeneratedAppGenerationRunDtoStatusEnum = {
    Queued: 'queued',
    Running: 'running',
    Repairing: 'repairing',
    Passed: 'passed',
    Failed: 'failed',
    Cancelled: 'cancelled'
} as const;
export type CreateGeneratedAppGenerationRunDtoStatusEnum = typeof CreateGeneratedAppGenerationRunDtoStatusEnum[keyof typeof CreateGeneratedAppGenerationRunDtoStatusEnum];

/**
 * @export
 */
export const CreateGeneratedAppGenerationRunDtoTriggerSourceEnum = {
    Initial: 'initial',
    Manual: 'manual',
    Retry: 'retry',
    System: 'system'
} as const;
export type CreateGeneratedAppGenerationRunDtoTriggerSourceEnum = typeof CreateGeneratedAppGenerationRunDtoTriggerSourceEnum[keyof typeof CreateGeneratedAppGenerationRunDtoTriggerSourceEnum];

/**
 * 
 * @export
 * @interface CreateGeneratedAppRepairAttemptDto
 */
export interface CreateGeneratedAppRepairAttemptDto {
    /**
     * 
     * @type {number}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    attemptNumber?: number;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    targetGateId: CreateGeneratedAppRepairAttemptDtoTargetGateIdEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    status?: CreateGeneratedAppRepairAttemptDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    failureSummary: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    changeSummary?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    verificationSummary?: string | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    repairPlan?: { [key: string]: any; } | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    reverificationPlan?: { [key: string]: any; } | null;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    startedAt?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppRepairAttemptDto
     */
    completedAt?: string | null;
}


/**
 * @export
 */
export const CreateGeneratedAppRepairAttemptDtoTargetGateIdEnum = {
    _0: 'gate-0',
    _1: 'gate-1',
    _2: 'gate-2',
    _3: 'gate-3',
    _4: 'gate-4',
    _5: 'gate-5',
    _6: 'gate-6',
    _7: 'gate-7'
} as const;
export type CreateGeneratedAppRepairAttemptDtoTargetGateIdEnum = typeof CreateGeneratedAppRepairAttemptDtoTargetGateIdEnum[keyof typeof CreateGeneratedAppRepairAttemptDtoTargetGateIdEnum];

/**
 * @export
 */
export const CreateGeneratedAppRepairAttemptDtoStatusEnum = {
    Planned: 'planned',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed',
    Skipped: 'skipped'
} as const;
export type CreateGeneratedAppRepairAttemptDtoStatusEnum = typeof CreateGeneratedAppRepairAttemptDtoStatusEnum[keyof typeof CreateGeneratedAppRepairAttemptDtoStatusEnum];

/**
 * 
 * @export
 * @interface CreateGeneratedAppSubmissionDto
 */
export interface CreateGeneratedAppSubmissionDto {
    /**
     * 
     * @type {string}
     * @memberof CreateGeneratedAppSubmissionDto
     */
    anonymousSessionId?: string;
    /**
     * 
     * @type {any}
     * @memberof CreateGeneratedAppSubmissionDto
     */
    input?: any | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateGeneratedAppSubmissionDto
     */
    clientContext?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDto
 */
export interface CreateKnowledgeBaseDto {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDto
     */
    description?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDto
     */
    visibility?: CreateKnowledgeBaseDtoVisibilityEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDto
     */
    embeddingModel?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDto
     */
    embeddingModelConfigId?: string | null;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoChunkingStrategy}
     * @memberof CreateKnowledgeBaseDto
     */
    chunkingStrategy?: CreateKnowledgeBaseDtoChunkingStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoRetrievalStrategy}
     * @memberof CreateKnowledgeBaseDto
     */
    retrievalStrategy?: CreateKnowledgeBaseDtoRetrievalStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoRerankingStrategy}
     * @memberof CreateKnowledgeBaseDto
     */
    rerankingStrategy?: CreateKnowledgeBaseDtoRerankingStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoQueryOrchestration}
     * @memberof CreateKnowledgeBaseDto
     */
    queryOrchestration?: CreateKnowledgeBaseDtoQueryOrchestration;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoVisibilityEnum = {
    Private: 'private',
    Organization: 'organization'
} as const;
export type CreateKnowledgeBaseDtoVisibilityEnum = typeof CreateKnowledgeBaseDtoVisibilityEnum[keyof typeof CreateKnowledgeBaseDtoVisibilityEnum];

/**
 * @type CreateKnowledgeBaseDtoChunkingStrategy
 * 
 * @export
 */
export type CreateKnowledgeBaseDtoChunkingStrategy = CreateKnowledgeBaseDtoChunkingStrategyOneOf | CreateKnowledgeBaseDtoChunkingStrategyOneOf1 | CreateKnowledgeBaseDtoChunkingStrategyOneOf2;
/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoChunkingStrategyOneOf
 */
export interface CreateKnowledgeBaseDtoChunkingStrategyOneOf {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf
     */
    type: CreateKnowledgeBaseDtoChunkingStrategyOneOfTypeEnum;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf
     */
    chunkSize?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf
     */
    chunkOverlap?: number;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoChunkingStrategyOneOfTypeEnum = {
    Sentence: 'sentence'
} as const;
export type CreateKnowledgeBaseDtoChunkingStrategyOneOfTypeEnum = typeof CreateKnowledgeBaseDtoChunkingStrategyOneOfTypeEnum[keyof typeof CreateKnowledgeBaseDtoChunkingStrategyOneOfTypeEnum];

/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoChunkingStrategyOneOf1
 */
export interface CreateKnowledgeBaseDtoChunkingStrategyOneOf1 {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf1
     */
    type: CreateKnowledgeBaseDtoChunkingStrategyOneOf1TypeEnum;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf1
     */
    windowSize?: number;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoChunkingStrategyOneOf1TypeEnum = {
    SentenceWindow: 'sentence_window'
} as const;
export type CreateKnowledgeBaseDtoChunkingStrategyOneOf1TypeEnum = typeof CreateKnowledgeBaseDtoChunkingStrategyOneOf1TypeEnum[keyof typeof CreateKnowledgeBaseDtoChunkingStrategyOneOf1TypeEnum];

/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoChunkingStrategyOneOf2
 */
export interface CreateKnowledgeBaseDtoChunkingStrategyOneOf2 {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoChunkingStrategyOneOf2
     */
    type: CreateKnowledgeBaseDtoChunkingStrategyOneOf2TypeEnum;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoChunkingStrategyOneOf2TypeEnum = {
    Markdown: 'markdown'
} as const;
export type CreateKnowledgeBaseDtoChunkingStrategyOneOf2TypeEnum = typeof CreateKnowledgeBaseDtoChunkingStrategyOneOf2TypeEnum[keyof typeof CreateKnowledgeBaseDtoChunkingStrategyOneOf2TypeEnum];

/**
 * @type CreateKnowledgeBaseDtoQueryOrchestration
 * 
 * @export
 */
export type CreateKnowledgeBaseDtoQueryOrchestration = CreateKnowledgeBaseDtoQueryOrchestrationOneOf | CreateKnowledgeBaseDtoRerankingStrategyOneOf;
/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoQueryOrchestrationOneOf
 */
export interface CreateKnowledgeBaseDtoQueryOrchestrationOneOf {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoQueryOrchestrationOneOf
     */
    type: CreateKnowledgeBaseDtoQueryOrchestrationOneOfTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoQueryOrchestrationOneOf
     */
    modelConfigId?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoQueryOrchestrationOneOf
     */
    promptTemplate?: string | null;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoQueryOrchestrationOneOfTypeEnum = {
    Hyde: 'hyde'
} as const;
export type CreateKnowledgeBaseDtoQueryOrchestrationOneOfTypeEnum = typeof CreateKnowledgeBaseDtoQueryOrchestrationOneOfTypeEnum[keyof typeof CreateKnowledgeBaseDtoQueryOrchestrationOneOfTypeEnum];

/**
 * @type CreateKnowledgeBaseDtoRerankingStrategy
 * 
 * @export
 */
export type CreateKnowledgeBaseDtoRerankingStrategy = CreateKnowledgeBaseDtoRerankingStrategyOneOf | CreateKnowledgeBaseDtoRerankingStrategyOneOf1;
/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoRerankingStrategyOneOf
 */
export interface CreateKnowledgeBaseDtoRerankingStrategyOneOf {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf
     */
    type: CreateKnowledgeBaseDtoRerankingStrategyOneOfTypeEnum;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoRerankingStrategyOneOfTypeEnum = {
    None: 'none'
} as const;
export type CreateKnowledgeBaseDtoRerankingStrategyOneOfTypeEnum = typeof CreateKnowledgeBaseDtoRerankingStrategyOneOfTypeEnum[keyof typeof CreateKnowledgeBaseDtoRerankingStrategyOneOfTypeEnum];

/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoRerankingStrategyOneOf1
 */
export interface CreateKnowledgeBaseDtoRerankingStrategyOneOf1 {
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    type: CreateKnowledgeBaseDtoRerankingStrategyOneOf1TypeEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    model?: string;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    topN?: number;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    apiKeyId?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    baseUrl?: string | null;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoRerankingStrategyOneOf1
     */
    timeoutMs?: number | null;
}


/**
 * @export
 */
export const CreateKnowledgeBaseDtoRerankingStrategyOneOf1TypeEnum = {
    Cohere: 'cohere'
} as const;
export type CreateKnowledgeBaseDtoRerankingStrategyOneOf1TypeEnum = typeof CreateKnowledgeBaseDtoRerankingStrategyOneOf1TypeEnum[keyof typeof CreateKnowledgeBaseDtoRerankingStrategyOneOf1TypeEnum];

/**
 * 
 * @export
 * @interface CreateKnowledgeBaseDtoRetrievalStrategy
 */
export interface CreateKnowledgeBaseDtoRetrievalStrategy {
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoRetrievalStrategy
     */
    topK?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateKnowledgeBaseDtoRetrievalStrategy
     */
    similarityThreshold?: number | null;
}
/**
 * 
 * @export
 * @interface CreateLlmModelConfigDto
 */
export interface CreateLlmModelConfigDto {
    /**
     * 
     * @type {string}
     * @memberof CreateLlmModelConfigDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmModelConfigDto
     */
    providerId: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmModelConfigDto
     */
    modelId: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateLlmModelConfigDto
     */
    parameters?: { [key: string]: any; };
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDto
     */
    isDefault?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDto
     */
    isEnabled?: boolean;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmModelConfigDto
     */
    modelType?: CreateLlmModelConfigDtoModelTypeEnum;
    /**
     * 
     * @type {CreateLlmModelConfigDtoCapabilities}
     * @memberof CreateLlmModelConfigDto
     */
    capabilities?: CreateLlmModelConfigDtoCapabilities;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDto
     */
    contextWindow?: number | null;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDto
     */
    maxOutputTokens?: number | null;
    /**
     * 
     * @type {CreateLlmModelConfigDtoPricing}
     * @memberof CreateLlmModelConfigDto
     */
    pricing?: CreateLlmModelConfigDtoPricing | null;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDto
     */
    timeoutMs?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDto
     */
    embeddingDimensions?: number;
}


/**
 * @export
 */
export const CreateLlmModelConfigDtoModelTypeEnum = {
    Chat: 'chat',
    Embedding: 'embedding'
} as const;
export type CreateLlmModelConfigDtoModelTypeEnum = typeof CreateLlmModelConfigDtoModelTypeEnum[keyof typeof CreateLlmModelConfigDtoModelTypeEnum];

/**
 * 
 * @export
 * @interface CreateLlmModelConfigDtoCapabilities
 */
export interface CreateLlmModelConfigDtoCapabilities {
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDtoCapabilities
     */
    vision?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDtoCapabilities
     */
    functionCalling?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDtoCapabilities
     */
    reasoning?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmModelConfigDtoCapabilities
     */
    structuredOutput?: boolean;
}
/**
 * 
 * @export
 * @interface CreateLlmModelConfigDtoPricing
 */
export interface CreateLlmModelConfigDtoPricing {
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricing
     */
    inputPer1MTokens: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricing
     */
    outputPer1MTokens: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricing
     */
    cachedReadPer1MTokens?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricing
     */
    cachedWritePer1MTokens?: number;
    /**
     * 
     * @type {Array<CreateLlmModelConfigDtoPricingTiersInner>}
     * @memberof CreateLlmModelConfigDtoPricing
     */
    tiers?: Array<CreateLlmModelConfigDtoPricingTiersInner>;
}
/**
 * 
 * @export
 * @interface CreateLlmModelConfigDtoPricingTiersInner
 */
export interface CreateLlmModelConfigDtoPricingTiersInner {
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricingTiersInner
     */
    aboveTokens: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricingTiersInner
     */
    inputPer1MTokens: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricingTiersInner
     */
    outputPer1MTokens: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricingTiersInner
     */
    cachedReadPer1MTokens?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmModelConfigDtoPricingTiersInner
     */
    cachedWritePer1MTokens?: number;
}
/**
 * 
 * @export
 * @interface CreateLlmProviderDto
 */
export interface CreateLlmProviderDto {
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    slug?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    baseUrl: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    apiProtocol?: CreateLlmProviderDtoApiProtocolEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    apiKeyId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    apiKey?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateLlmProviderDto
     */
    iconUrl?: string;
    /**
     * 
     * @type {number}
     * @memberof CreateLlmProviderDto
     */
    sortOrder?: number;
    /**
     * 
     * @type {boolean}
     * @memberof CreateLlmProviderDto
     */
    isEnabled?: boolean;
}


/**
 * @export
 */
export const CreateLlmProviderDtoApiProtocolEnum = {
    OpenaiChat: 'openai_chat',
    OpenaiResponses: 'openai_responses',
    Anthropic: 'anthropic',
    Google: 'google',
    Cohere: 'cohere'
} as const;
export type CreateLlmProviderDtoApiProtocolEnum = typeof CreateLlmProviderDtoApiProtocolEnum[keyof typeof CreateLlmProviderDtoApiProtocolEnum];

/**
 * 
 * @export
 * @interface CreateMemoryAliasDto
 */
export interface CreateMemoryAliasDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryAliasDto
     */
    sourceUri: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryAliasDto
     */
    aliasUri: string;
}
/**
 * 
 * @export
 * @interface CreateMemoryEdgeDto
 */
export interface CreateMemoryEdgeDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryEdgeDto
     */
    parentNodeId: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryEdgeDto
     */
    childNodeId: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryEdgeDto
     */
    name?: string;
    /**
     * 
     * @type {number}
     * @memberof CreateMemoryEdgeDto
     */
    priority?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateMemoryEdgeDto
     */
    disclosure?: number;
}
/**
 * 
 * @export
 * @interface CreateMemoryInstanceDto
 */
export interface CreateMemoryInstanceDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryInstanceDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryInstanceDto
     */
    description?: string | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateMemoryInstanceDto
     */
    config?: { [key: string]: any; };
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryInstanceDto
     */
    systemPromptOverride?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateMemoryInstanceDto
     */
    validDomains?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateMemoryInstanceDto
     */
    coreMemoryUris?: Array<string>;
}
/**
 * 
 * @export
 * @interface CreateMemoryNodeDto
 */
export interface CreateMemoryNodeDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryNodeDto
     */
    contentType?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof CreateMemoryNodeDto
     */
    metadata?: { [key: string]: any; };
    /**
     * 
     * @type {number}
     * @memberof CreateMemoryNodeDto
     */
    disclosureLevel?: number;
}
/**
 * 
 * @export
 * @interface CreateMemoryPathDto
 */
export interface CreateMemoryPathDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryPathDto
     */
    domain: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryPathDto
     */
    pathString: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryPathDto
     */
    nodeId: string;
}
/**
 * 
 * @export
 * @interface CreateMemoryVersionDto
 */
export interface CreateMemoryVersionDto {
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryVersionDto
     */
    content?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryVersionDto
     */
    mode?: CreateMemoryVersionDtoModeEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryVersionDto
     */
    oldString?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateMemoryVersionDto
     */
    newString?: string;
}


/**
 * @export
 */
export const CreateMemoryVersionDtoModeEnum = {
    Create: 'create',
    Patch: 'patch',
    Append: 'append'
} as const;
export type CreateMemoryVersionDtoModeEnum = typeof CreateMemoryVersionDtoModeEnum[keyof typeof CreateMemoryVersionDtoModeEnum];

/**
 * 
 * @export
 * @interface CreateOrganizationDto
 */
export interface CreateOrganizationDto {
    /**
     * 
     * @type {string}
     * @memberof CreateOrganizationDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateOrganizationDto
     */
    description?: string;
}
/**
 * 
 * @export
 * @interface CreatePlatformApiTokenSwaggerDto
 */
export interface CreatePlatformApiTokenSwaggerDto {
    /**
     * 
     * @type {string}
     * @memberof CreatePlatformApiTokenSwaggerDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreatePlatformApiTokenSwaggerDto
     */
    scopes?: string;
    /**
     * 
     * @type {string}
     * @memberof CreatePlatformApiTokenSwaggerDto
     */
    expiresAt?: string;
}
/**
 * 
 * @export
 * @interface CreateReusableBlockDto
 */
export interface CreateReusableBlockDto {
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDto
     */
    description?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDto
     */
    category?: CreateReusableBlockDtoCategoryEnum;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateReusableBlockDto
     */
    tags?: Array<string>;
    /**
     * 
     * @type {CreateReusableBlockDtoDefinition}
     * @memberof CreateReusableBlockDto
     */
    definition: CreateReusableBlockDtoDefinition;
    /**
     * 
     * @type {CreateReusableBlockDtoMetadata}
     * @memberof CreateReusableBlockDto
     */
    metadata?: CreateReusableBlockDtoMetadata;
}


/**
 * @export
 */
export const CreateReusableBlockDtoCategoryEnum = {
    Analysis: 'analysis',
    Content: 'content',
    Development: 'development',
    Automation: 'automation',
    Reporting: 'reporting'
} as const;
export type CreateReusableBlockDtoCategoryEnum = typeof CreateReusableBlockDtoCategoryEnum[keyof typeof CreateReusableBlockDtoCategoryEnum];

/**
 * 
 * @export
 * @interface CreateReusableBlockDtoDefinition
 */
export interface CreateReusableBlockDtoDefinition {
    /**
     * 
     * @type {Array<CreateReusableBlockDtoDefinitionNodesInner>}
     * @memberof CreateReusableBlockDtoDefinition
     */
    nodes: Array<CreateReusableBlockDtoDefinitionNodesInner>;
    /**
     * 
     * @type {Array<CreateReusableBlockDtoDefinitionEdgesInner>}
     * @memberof CreateReusableBlockDtoDefinition
     */
    edges: Array<CreateReusableBlockDtoDefinitionEdgesInner>;
    /**
     * 
     * @type {Array<CreateReusableBlockDtoDefinitionInputPortsInner>}
     * @memberof CreateReusableBlockDtoDefinition
     */
    inputPorts: Array<CreateReusableBlockDtoDefinitionInputPortsInner>;
    /**
     * 
     * @type {Array<CreateReusableBlockDtoDefinitionInputPortsInner>}
     * @memberof CreateReusableBlockDtoDefinition
     */
    outputPorts: Array<CreateReusableBlockDtoDefinitionInputPortsInner>;
    /**
     * 
     * @type {CreateReusableBlockDtoDefinitionViewport}
     * @memberof CreateReusableBlockDtoDefinition
     */
    viewport?: CreateReusableBlockDtoDefinitionViewport;
}
/**
 * 
 * @export
 * @interface CreateReusableBlockDtoDefinitionEdgesInner
 */
export interface CreateReusableBlockDtoDefinitionEdgesInner {
    [key: string]: any | any;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionEdgesInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionEdgesInner
     */
    source: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionEdgesInner
     */
    target: string;
}
/**
 * 
 * @export
 * @interface CreateReusableBlockDtoDefinitionInputPortsInner
 */
export interface CreateReusableBlockDtoDefinitionInputPortsInner {
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionInputPortsInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionInputPortsInner
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionInputPortsInner
     */
    dataType: CreateReusableBlockDtoDefinitionInputPortsInnerDataTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionInputPortsInner
     */
    sourceNodeId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionInputPortsInner
     */
    sourcePortId?: string;
}


/**
 * @export
 */
export const CreateReusableBlockDtoDefinitionInputPortsInnerDataTypeEnum = {
    Model: 'model',
    Text: 'text',
    Json: 'json',
    Image: 'image',
    Audio: 'audio',
    Tool: 'tool',
    Sandbox: 'sandbox',
    Knowledge: 'knowledge',
    Skill: 'skill',
    Memory: 'memory'
} as const;
export type CreateReusableBlockDtoDefinitionInputPortsInnerDataTypeEnum = typeof CreateReusableBlockDtoDefinitionInputPortsInnerDataTypeEnum[keyof typeof CreateReusableBlockDtoDefinitionInputPortsInnerDataTypeEnum];

/**
 * 
 * @export
 * @interface CreateReusableBlockDtoDefinitionNodesInner
 */
export interface CreateReusableBlockDtoDefinitionNodesInner {
    [key: string]: any | any;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoDefinitionNodesInner
     */
    id: string;
}
/**
 * 
 * @export
 * @interface CreateReusableBlockDtoDefinitionViewport
 */
export interface CreateReusableBlockDtoDefinitionViewport {
    /**
     * 
     * @type {number}
     * @memberof CreateReusableBlockDtoDefinitionViewport
     */
    x: number;
    /**
     * 
     * @type {number}
     * @memberof CreateReusableBlockDtoDefinitionViewport
     */
    y: number;
    /**
     * 
     * @type {number}
     * @memberof CreateReusableBlockDtoDefinitionViewport
     */
    zoom: number;
}
/**
 * 
 * @export
 * @interface CreateReusableBlockDtoMetadata
 */
export interface CreateReusableBlockDtoMetadata {
    /**
     * 
     * @type {number}
     * @memberof CreateReusableBlockDtoMetadata
     */
    nodeCount: number;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoMetadata
     */
    author?: string;
    /**
     * 
     * @type {number}
     * @memberof CreateReusableBlockDtoMetadata
     */
    version: number;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoMetadata
     */
    createdFromWorkflowId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateReusableBlockDtoMetadata
     */
    exportedAt?: string;
}
/**
 * 
 * @export
 * @interface CreateSandboxDto
 */
export interface CreateSandboxDto {
    /**
     * 
     * @type {string}
     * @memberof CreateSandboxDto
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof CreateSandboxDto
     */
    cpu?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateSandboxDto
     */
    memory?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateSandboxDto
     */
    disk?: number;
    /**
     * 
     * @type {number}
     * @memberof CreateSandboxDto
     */
    conversationIdleAutoEndMinutes?: number;
}
/**
 * 
 * @export
 * @interface CreateTriggerDto
 */
export interface CreateTriggerDto {
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDto
     */
    description?: string;
    /**
     * 
     * @type {boolean}
     * @memberof CreateTriggerDto
     */
    isEnabled?: boolean;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDto
     */
    type: CreateTriggerDtoTypeEnum;
    /**
     * 
     * @type {CreateTriggerDtoConfig}
     * @memberof CreateTriggerDto
     */
    config: CreateTriggerDtoConfig;
}


/**
 * @export
 */
export const CreateTriggerDtoTypeEnum = {
    Cron: 'cron',
    Webhook: 'webhook',
    ApiEvent: 'api_event'
} as const;
export type CreateTriggerDtoTypeEnum = typeof CreateTriggerDtoTypeEnum[keyof typeof CreateTriggerDtoTypeEnum];

/**
 * 
 * @export
 * @interface CreateTriggerDtoConfig
 */
export interface CreateTriggerDtoConfig {
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    expression: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    timezone?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    authMode?: CreateTriggerDtoConfigAuthModeEnum;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateTriggerDtoConfig
     */
    ipWhitelist?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    eventSource: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    eventType: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfig
     */
    filterExpression?: string;
}


/**
 * @export
 */
export const CreateTriggerDtoConfigAuthModeEnum = {
    Simple: 'simple',
    Signed: 'signed'
} as const;
export type CreateTriggerDtoConfigAuthModeEnum = typeof CreateTriggerDtoConfigAuthModeEnum[keyof typeof CreateTriggerDtoConfigAuthModeEnum];

/**
 * 
 * @export
 * @interface CreateTriggerDtoConfigAnyOf
 */
export interface CreateTriggerDtoConfigAnyOf {
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf
     */
    expression: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf
     */
    timezone?: string;
}
/**
 * 
 * @export
 * @interface CreateTriggerDtoConfigAnyOf1
 */
export interface CreateTriggerDtoConfigAnyOf1 {
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf1
     */
    authMode?: CreateTriggerDtoConfigAnyOf1AuthModeEnum;
    /**
     * 
     * @type {Array<string>}
     * @memberof CreateTriggerDtoConfigAnyOf1
     */
    ipWhitelist?: Array<string>;
}


/**
 * @export
 */
export const CreateTriggerDtoConfigAnyOf1AuthModeEnum = {
    Simple: 'simple',
    Signed: 'signed'
} as const;
export type CreateTriggerDtoConfigAnyOf1AuthModeEnum = typeof CreateTriggerDtoConfigAnyOf1AuthModeEnum[keyof typeof CreateTriggerDtoConfigAnyOf1AuthModeEnum];

/**
 * 
 * @export
 * @interface CreateTriggerDtoConfigAnyOf2
 */
export interface CreateTriggerDtoConfigAnyOf2 {
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf2
     */
    eventSource: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf2
     */
    eventType: string;
    /**
     * 
     * @type {string}
     * @memberof CreateTriggerDtoConfigAnyOf2
     */
    filterExpression?: string;
}
/**
 * 
 * @export
 * @interface CreateVersionDto
 */
export interface CreateVersionDto {
    /**
     * 
     * @type {string}
     * @memberof CreateVersionDto
     */
    label?: string;
}
/**
 * 
 * @export
 * @interface CreateWorkflowDefinitionDto
 */
export interface CreateWorkflowDefinitionDto {
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    description?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    icon?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    templateSlug?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    marketplaceListingId?: string;
    /**
     * 
     * @type {string}
     * @memberof CreateWorkflowDefinitionDto
     */
    shareToken?: string;
}
/**
 * 
 * @export
 * @interface DeleteGeneratedAppSubmissionsDto
 */
export interface DeleteGeneratedAppSubmissionsDto {
    /**
     * 
     * @type {Array<string>}
     * @memberof DeleteGeneratedAppSubmissionsDto
     */
    ids: Array<string>;
}
/**
 * 
 * @export
 * @interface DeveloperKeyResponseDto
 */
export interface DeveloperKeyResponseDto {
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    publicKey: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    label?: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    keyFingerprint: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    status: DeveloperKeyResponseDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    createdAt: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    updatedAt: string;
    /**
     * 
     * @type {string}
     * @memberof DeveloperKeyResponseDto
     */
    revokedAt: string | null;
}


/**
 * @export
 */
export const DeveloperKeyResponseDtoStatusEnum = {
    Active: 'active',
    Revoked: 'revoked'
} as const;
export type DeveloperKeyResponseDtoStatusEnum = typeof DeveloperKeyResponseDtoStatusEnum[keyof typeof DeveloperKeyResponseDtoStatusEnum];

/**
 * 
 * @export
 * @interface DiscoverMcpToolsDto
 */
export interface DiscoverMcpToolsDto {
    /**
     * 
     * @type {TestMcpConnectionDtoConnection}
     * @memberof DiscoverMcpToolsDto
     */
    connection: TestMcpConnectionDtoConnection;
}
/**
 * 
 * @export
 * @interface ImportMcpToolsDto
 */
export interface ImportMcpToolsDto {
    /**
     * 
     * @type {string}
     * @memberof ImportMcpToolsDto
     */
    serverName: string;
    /**
     * 
     * @type {string}
     * @memberof ImportMcpToolsDto
     */
    serverDescription?: string;
    /**
     * 
     * @type {TestMcpConnectionDtoConnection}
     * @memberof ImportMcpToolsDto
     */
    connection: TestMcpConnectionDtoConnection;
    /**
     * 
     * @type {Array<string>}
     * @memberof ImportMcpToolsDto
     */
    toolNames: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof ImportMcpToolsDto
     */
    conflictStrategy: ImportMcpToolsDtoConflictStrategyEnum;
}


/**
 * @export
 */
export const ImportMcpToolsDtoConflictStrategyEnum = {
    Skip: 'skip',
    Overwrite: 'overwrite'
} as const;
export type ImportMcpToolsDtoConflictStrategyEnum = typeof ImportMcpToolsDtoConflictStrategyEnum[keyof typeof ImportMcpToolsDtoConflictStrategyEnum];

/**
 * 
 * @export
 * @interface InstallMarketplaceListingDto
 */
export interface InstallMarketplaceListingDto {
    /**
     * 
     * @type {string}
     * @memberof InstallMarketplaceListingDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof InstallMarketplaceListingDto
     */
    description?: string;
}
/**
 * 
 * @export
 * @interface InterveneStepDto
 */
export interface InterveneStepDto {
    /**
     * 
     * @type {string}
     * @memberof InterveneStepDto
     */
    action: InterveneStepDtoActionEnum;
    /**
     * 
     * @type {string}
     * @memberof InterveneStepDto
     */
    feedback?: string;
    /**
     * 
     * @type {string}
     * @memberof InterveneStepDto
     */
    modifiedContent?: string;
}


/**
 * @export
 */
export const InterveneStepDtoActionEnum = {
    Approve: 'approve',
    Modify: 'modify',
    Reject: 'reject'
} as const;
export type InterveneStepDtoActionEnum = typeof InterveneStepDtoActionEnum[keyof typeof InterveneStepDtoActionEnum];

/**
 * 
 * @export
 * @interface InviteMemberDto
 */
export interface InviteMemberDto {
    /**
     * 
     * @type {string}
     * @memberof InviteMemberDto
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof InviteMemberDto
     */
    role?: InviteMemberDtoRoleEnum;
}


/**
 * @export
 */
export const InviteMemberDtoRoleEnum = {
    Owner: 'owner',
    Admin: 'admin',
    Creator: 'creator',
    Operator: 'operator',
    Viewer: 'viewer'
} as const;
export type InviteMemberDtoRoleEnum = typeof InviteMemberDtoRoleEnum[keyof typeof InviteMemberDtoRoleEnum];

/**
 * 
 * @export
 * @interface LoginDto
 */
export interface LoginDto {
    /**
     * 
     * @type {string}
     * @memberof LoginDto
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof LoginDto
     */
    password: string;
}
/**
 * 
 * @export
 * @interface MfaDisableDto
 */
export interface MfaDisableDto {
    /**
     * 
     * @type {string}
     * @memberof MfaDisableDto
     */
    code: string;
}
/**
 * 
 * @export
 * @interface MfaLoginVerifyDto
 */
export interface MfaLoginVerifyDto {
    /**
     * 
     * @type {string}
     * @memberof MfaLoginVerifyDto
     */
    mfaToken?: string;
    /**
     * 
     * @type {string}
     * @memberof MfaLoginVerifyDto
     */
    factorId?: string;
    /**
     * 
     * @type {string}
     * @memberof MfaLoginVerifyDto
     */
    code: string;
}
/**
 * 
 * @export
 * @interface MfaVerifyDto
 */
export interface MfaVerifyDto {
    /**
     * 
     * @type {string}
     * @memberof MfaVerifyDto
     */
    factorId?: string;
    /**
     * 
     * @type {string}
     * @memberof MfaVerifyDto
     */
    code: string;
}
/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDto
 */
export interface MonitoringDashboardEnvelopeDto {
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoData}
     * @memberof MonitoringDashboardEnvelopeDto
     */
    data: MonitoringDashboardEnvelopeDtoData;
}
/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoData
 */
export interface MonitoringDashboardEnvelopeDtoData {
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataSummary}
     * @memberof MonitoringDashboardEnvelopeDtoData
     */
    summary: MonitoringDashboardEnvelopeDtoDataSummary;
    /**
     * 
     * @type {Array<MonitoringDashboardEnvelopeDtoDataTrendInner>}
     * @memberof MonitoringDashboardEnvelopeDtoData
     */
    trend: Array<MonitoringDashboardEnvelopeDtoDataTrendInner>;
    /**
     * 
     * @type {Array<MonitoringDashboardEnvelopeDtoDataAlertsInner>}
     * @memberof MonitoringDashboardEnvelopeDtoData
     */
    alerts: Array<MonitoringDashboardEnvelopeDtoDataAlertsInner>;
    /**
     * 
     * @type {Array<MonitoringDashboardEnvelopeDtoDataHotspotsInner>}
     * @memberof MonitoringDashboardEnvelopeDtoData
     */
    hotspots: Array<MonitoringDashboardEnvelopeDtoDataHotspotsInner>;
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataRiskSummary}
     * @memberof MonitoringDashboardEnvelopeDtoData
     */
    riskSummary: MonitoringDashboardEnvelopeDtoDataRiskSummary;
}
/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataAlertsInner
 */
export interface MonitoringDashboardEnvelopeDtoDataAlertsInner {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    severity: MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    category: MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    title: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    reason: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    detectedAt: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    affectedSummary: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    source: MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum;
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInner
     */
    linkTarget?: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum = {
    Info: 'info',
    Warning: 'warning',
    Critical: 'critical'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum = {
    ErrorRate: 'error-rate',
    QueueDepth: 'queue-depth',
    GovernanceBlock: 'governance-block',
    AnomalousExecution: 'anomalous-execution'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum = {
    ExecutionRecords: 'execution-records',
    WorkflowExecutions: 'workflow-executions',
    ResourceGovernance: 'resource-governance',
    Notifications: 'notifications',
    AuditLogs: 'audit-logs',
    ExecutionQueue: 'execution-queue',
    Derived: 'derived'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget
 */
export interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget
     */
    type: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget
     */
    href: string;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetTypeEnum = {
    ResourceGovernance: 'resource-governance',
    Execution: 'execution'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetTypeEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetTypeEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetTypeEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf
 */
export interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf
     */
    type: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf
     */
    href: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfHrefEnum;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfTypeEnum = {
    ResourceGovernance: 'resource-governance'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfTypeEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfTypeEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfTypeEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfHrefEnum = {
    SettingsResourceQuotas: '/settings/resource-quotas'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfHrefEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfHrefEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOfHrefEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1
 */
export interface MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1 {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1
     */
    type: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1TypeEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1
     */
    href: string;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1TypeEnum = {
    Execution: 'execution'
} as const;
export type MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1TypeEnum = typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1TypeEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1TypeEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataHotspotsInner
 */
export interface MonitoringDashboardEnvelopeDtoDataHotspotsInner {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    kind: MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    impactSummary: string;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    executionCount: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    failureRate: number | null;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    queueDepth: number | null;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    status: MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    lastSeenAt: string;
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget}
     * @memberof MonitoringDashboardEnvelopeDtoDataHotspotsInner
     */
    linkTarget?: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum = {
    Workflow: 'workflow',
    Execution: 'execution'
} as const;
export type MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum = typeof MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum = {
    Healthy: 'healthy',
    Running: 'running',
    Failed: 'failed',
    Paused: 'paused',
    GovernancePaused: 'governance-paused',
    Blocked: 'blocked'
} as const;
export type MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum = typeof MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataRiskSummary
 */
export interface MonitoringDashboardEnvelopeDtoDataRiskSummary {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    level: MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    title: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    summary: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    explanation: string;
    /**
     * 
     * @type {boolean}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    governancePauseActive: boolean;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    lastEvaluatedAt: string;
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget}
     * @memberof MonitoringDashboardEnvelopeDtoDataRiskSummary
     */
    primaryLinkTarget?: MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTarget;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum = {
    Stable: 'stable',
    Warning: 'warning',
    Critical: 'critical'
} as const;
export type MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum = typeof MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataSummary
 */
export interface MonitoringDashboardEnvelopeDtoDataSummary {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    scope: MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    window: MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    lastUpdatedAt: string;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    executionCount: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    successRate: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    failureRate: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    averageDurationMs: number | null;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    queueDepth: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    governanceBlocks: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    activeAlerts: number;
    /**
     * 
     * @type {MonitoringDashboardEnvelopeDtoDataSummaryMetricSources}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummary
     */
    metricSources: MonitoringDashboardEnvelopeDtoDataSummaryMetricSources;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum = {
    Organization: 'organization'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum = {
    _15m: '15m',
    _1h: '1h',
    _24h: '24h'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataSummaryMetricSources
 */
export interface MonitoringDashboardEnvelopeDtoDataSummaryMetricSources {
    /**
     * 
     * @type {Array<string>}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummaryMetricSources
     */
    execution: Array<MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum>;
    /**
     * 
     * @type {Array<string>}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummaryMetricSources
     */
    governance: Array<MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesGovernanceEnum>;
    /**
     * 
     * @type {Array<string>}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummaryMetricSources
     */
    alerts: Array<MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesAlertsEnum>;
    /**
     * 
     * @type {Array<string>}
     * @memberof MonitoringDashboardEnvelopeDtoDataSummaryMetricSources
     */
    queueDepth: Array<MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesQueueDepthEnum>;
}


/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum = {
    ExecutionRecords: 'execution-records',
    WorkflowExecutions: 'workflow-executions',
    ResourceGovernance: 'resource-governance',
    Notifications: 'notifications',
    AuditLogs: 'audit-logs',
    ExecutionQueue: 'execution-queue',
    Derived: 'derived'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesGovernanceEnum = {
    ExecutionRecords: 'execution-records',
    WorkflowExecutions: 'workflow-executions',
    ResourceGovernance: 'resource-governance',
    Notifications: 'notifications',
    AuditLogs: 'audit-logs',
    ExecutionQueue: 'execution-queue',
    Derived: 'derived'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesGovernanceEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesGovernanceEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesGovernanceEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesAlertsEnum = {
    ExecutionRecords: 'execution-records',
    WorkflowExecutions: 'workflow-executions',
    ResourceGovernance: 'resource-governance',
    Notifications: 'notifications',
    AuditLogs: 'audit-logs',
    ExecutionQueue: 'execution-queue',
    Derived: 'derived'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesAlertsEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesAlertsEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesAlertsEnum];

/**
 * @export
 */
export const MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesQueueDepthEnum = {
    ExecutionRecords: 'execution-records',
    WorkflowExecutions: 'workflow-executions',
    ResourceGovernance: 'resource-governance',
    Notifications: 'notifications',
    AuditLogs: 'audit-logs',
    ExecutionQueue: 'execution-queue',
    Derived: 'derived'
} as const;
export type MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesQueueDepthEnum = typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesQueueDepthEnum[keyof typeof MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesQueueDepthEnum];

/**
 * 
 * @export
 * @interface MonitoringDashboardEnvelopeDtoDataTrendInner
 */
export interface MonitoringDashboardEnvelopeDtoDataTrendInner {
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    bucketStart: string;
    /**
     * 
     * @type {string}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    bucketLabel: string;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    executionCount: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    successRate: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    failureRate: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    averageDurationMs: number | null;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    queueDepth: number | null;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    governanceBlocks: number;
    /**
     * 
     * @type {number}
     * @memberof MonitoringDashboardEnvelopeDtoDataTrendInner
     */
    activeAlerts: number;
}
/**
 * 
 * @export
 * @interface OAuthInitiateBodyDto
 */
export interface OAuthInitiateBodyDto {
    /**
     * 
     * @type {string}
     * @memberof OAuthInitiateBodyDto
     */
    redirectUrl?: string;
    /**
     * 
     * @type {string}
     * @memberof OAuthInitiateBodyDto
     */
    platform?: OAuthInitiateBodyDtoPlatformEnum;
}


/**
 * @export
 */
export const OAuthInitiateBodyDtoPlatformEnum = {
    Mobile: 'mobile'
} as const;
export type OAuthInitiateBodyDtoPlatformEnum = typeof OAuthInitiateBodyDtoPlatformEnum[keyof typeof OAuthInitiateBodyDtoPlatformEnum];

/**
 * 
 * @export
 * @interface PlatformApiTokenCreateEnvelopeSwaggerDto
 */
export interface PlatformApiTokenCreateEnvelopeSwaggerDto {
    /**
     * 
     * @type {PlatformApiTokenCreateEnvelopeSwaggerDtoData}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDto
     */
    data: PlatformApiTokenCreateEnvelopeSwaggerDtoData;
}
/**
 * 
 * @export
 * @interface PlatformApiTokenCreateEnvelopeSwaggerDtoData
 */
export interface PlatformApiTokenCreateEnvelopeSwaggerDtoData {
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    tokenPrefix: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    scopes: string | null;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    lastUsedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    expiresAt: string | null;
    /**
     * 
     * @type {boolean}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    isRevoked: boolean;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    createdAt: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenCreateEnvelopeSwaggerDtoData
     */
    token: string;
}
/**
 * 
 * @export
 * @interface PlatformApiTokenListResponseSwaggerDto
 */
export interface PlatformApiTokenListResponseSwaggerDto {
    /**
     * 
     * @type {Array<PlatformApiTokenListResponseSwaggerDtoDataInner>}
     * @memberof PlatformApiTokenListResponseSwaggerDto
     */
    data: Array<PlatformApiTokenListResponseSwaggerDtoDataInner>;
    /**
     * 
     * @type {PlatformApiTokenListResponseSwaggerDtoMeta}
     * @memberof PlatformApiTokenListResponseSwaggerDto
     */
    meta: PlatformApiTokenListResponseSwaggerDtoMeta;
}
/**
 * 
 * @export
 * @interface PlatformApiTokenListResponseSwaggerDtoDataInner
 */
export interface PlatformApiTokenListResponseSwaggerDtoDataInner {
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    tokenPrefix: string;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    scopes: string | null;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    lastUsedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    expiresAt: string | null;
    /**
     * 
     * @type {boolean}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    isRevoked: boolean;
    /**
     * 
     * @type {string}
     * @memberof PlatformApiTokenListResponseSwaggerDtoDataInner
     */
    createdAt: string;
}
/**
 * 
 * @export
 * @interface PlatformApiTokenListResponseSwaggerDtoMeta
 */
export interface PlatformApiTokenListResponseSwaggerDtoMeta {
    /**
     * 
     * @type {number}
     * @memberof PlatformApiTokenListResponseSwaggerDtoMeta
     */
    page: number;
    /**
     * 
     * @type {number}
     * @memberof PlatformApiTokenListResponseSwaggerDtoMeta
     */
    pageSize: number;
    /**
     * 
     * @type {number}
     * @memberof PlatformApiTokenListResponseSwaggerDtoMeta
     */
    total: number;
}
/**
 * 
 * @export
 * @interface ProviderHealthStatusesResponseDto
 */
export interface ProviderHealthStatusesResponseDto {
    /**
     * 
     * @type {Array<ProviderHealthStatusesResponseDtoDataInner>}
     * @memberof ProviderHealthStatusesResponseDto
     */
    data: Array<ProviderHealthStatusesResponseDtoDataInner>;
}
/**
 * 
 * @export
 * @interface ProviderHealthStatusesResponseDtoDataInner
 */
export interface ProviderHealthStatusesResponseDtoDataInner {
    /**
     * 
     * @type {string}
     * @memberof ProviderHealthStatusesResponseDtoDataInner
     */
    providerName: string;
    /**
     * 
     * @type {string}
     * @memberof ProviderHealthStatusesResponseDtoDataInner
     */
    modelId: string | null;
    /**
     * 
     * @type {string}
     * @memberof ProviderHealthStatusesResponseDtoDataInner
     */
    status: ProviderHealthStatusesResponseDtoDataInnerStatusEnum;
    /**
     * 
     * @type {number}
     * @memberof ProviderHealthStatusesResponseDtoDataInner
     */
    failureCount: number;
    /**
     * 
     * @type {string}
     * @memberof ProviderHealthStatusesResponseDtoDataInner
     */
    lastFailureAt: string | null;
}


/**
 * @export
 */
export const ProviderHealthStatusesResponseDtoDataInnerStatusEnum = {
    Healthy: 'healthy',
    Degraded: 'degraded',
    Open: 'open'
} as const;
export type ProviderHealthStatusesResponseDtoDataInnerStatusEnum = typeof ProviderHealthStatusesResponseDtoDataInnerStatusEnum[keyof typeof ProviderHealthStatusesResponseDtoDataInnerStatusEnum];

/**
 * 
 * @export
 * @interface PublishWorkflowDto
 */
export interface PublishWorkflowDto {
    /**
     * 
     * @type {string}
     * @memberof PublishWorkflowDto
     */
    label?: string;
    /**
     * 
     * @type {string}
     * @memberof PublishWorkflowDto
     */
    releaseNotes?: string;
    /**
     * 
     * @type {string}
     * @memberof PublishWorkflowDto
     */
    versionId?: string;
}
/**
 * 
 * @export
 * @interface RebuildKnowledgeBaseDto
 */
export interface RebuildKnowledgeBaseDto {
    /**
     * 
     * @type {boolean}
     * @memberof RebuildKnowledgeBaseDto
     */
    force?: boolean;
}
/**
 * 
 * @export
 * @interface RecordGeneratedAppGateResultsDto
 */
export interface RecordGeneratedAppGateResultsDto {
    /**
     * 
     * @type {Array<RecordGeneratedAppGateResultsDtoGateResultsInner>}
     * @memberof RecordGeneratedAppGateResultsDto
     */
    gateResults: Array<RecordGeneratedAppGateResultsDtoGateResultsInner>;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof RecordGeneratedAppGateResultsDto
     */
    generationPlan?: { [key: string]: any; } | null;
    /**
     * 
     * @type {RecordGeneratedAppGateResultsDtoPreview}
     * @memberof RecordGeneratedAppGateResultsDto
     */
    preview?: RecordGeneratedAppGateResultsDtoPreview;
}
/**
 * 
 * @export
 * @interface RecordGeneratedAppGateResultsDtoGateResultsInner
 */
export interface RecordGeneratedAppGateResultsDtoGateResultsInner {
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    gateId: string;
    /**
     * 
     * @type {number}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    order?: number;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    name: string;
    /**
     * 
     * @type {boolean}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    blocking?: boolean;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    status: RecordGeneratedAppGateResultsDtoGateResultsInnerStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    summary: string;
    /**
     * 
     * @type {Array<CreateGeneratedAppGateRunDtoEvidenceInner>}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    evidence?: Array<CreateGeneratedAppGateRunDtoEvidenceInner>;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoGateResultsInner
     */
    updatedAt?: string;
}


/**
 * @export
 */
export const RecordGeneratedAppGateResultsDtoGateResultsInnerStatusEnum = {
    Pending: 'pending',
    Running: 'running',
    Passed: 'passed',
    Failed: 'failed',
    Warning: 'warning',
    Skipped: 'skipped'
} as const;
export type RecordGeneratedAppGateResultsDtoGateResultsInnerStatusEnum = typeof RecordGeneratedAppGateResultsDtoGateResultsInnerStatusEnum[keyof typeof RecordGeneratedAppGateResultsDtoGateResultsInnerStatusEnum];

/**
 * 
 * @export
 * @interface RecordGeneratedAppGateResultsDtoPreview
 */
export interface RecordGeneratedAppGateResultsDtoPreview {
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoPreview
     */
    previewUrl?: string | null;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoPreview
     */
    sourceArtifactUrl?: string | null;
    /**
     * 
     * @type {string}
     * @memberof RecordGeneratedAppGateResultsDtoPreview
     */
    testReportUrl?: string | null;
}
/**
 * 
 * @export
 * @interface RefreshTokenDto
 */
export interface RefreshTokenDto {
    /**
     * 
     * @type {string}
     * @memberof RefreshTokenDto
     */
    refreshToken: string;
}
/**
 * 
 * @export
 * @interface RegisterDeveloperKeyDto
 */
export interface RegisterDeveloperKeyDto {
    /**
     * 
     * @type {string}
     * @memberof RegisterDeveloperKeyDto
     */
    publicKey: string;
    /**
     * 
     * @type {string}
     * @memberof RegisterDeveloperKeyDto
     */
    label?: string;
}
/**
 * 
 * @export
 * @interface RegisterDeviceDto
 */
export interface RegisterDeviceDto {
    /**
     * 
     * @type {string}
     * @memberof RegisterDeviceDto
     */
    deviceToken: string;
    /**
     * 
     * @type {string}
     * @memberof RegisterDeviceDto
     */
    platform: RegisterDeviceDtoPlatformEnum;
}


/**
 * @export
 */
export const RegisterDeviceDtoPlatformEnum = {
    Android: 'android',
    Ios: 'ios'
} as const;
export type RegisterDeviceDtoPlatformEnum = typeof RegisterDeviceDtoPlatformEnum[keyof typeof RegisterDeviceDtoPlatformEnum];

/**
 * 
 * @export
 * @interface RegisterDto
 */
export interface RegisterDto {
    /**
     * 
     * @type {string}
     * @memberof RegisterDto
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof RegisterDto
     */
    password: string;
    /**
     * 
     * @type {string}
     * @memberof RegisterDto
     */
    displayName?: string;
}
/**
 * 
 * @export
 * @interface ReimportMcpToolsDto
 */
export interface ReimportMcpToolsDto {
    /**
     * 
     * @type {Array<string>}
     * @memberof ReimportMcpToolsDto
     */
    toolNames: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof ReimportMcpToolsDto
     */
    conflictStrategy: ReimportMcpToolsDtoConflictStrategyEnum;
}


/**
 * @export
 */
export const ReimportMcpToolsDtoConflictStrategyEnum = {
    Skip: 'skip',
    Overwrite: 'overwrite'
} as const;
export type ReimportMcpToolsDtoConflictStrategyEnum = typeof ReimportMcpToolsDtoConflictStrategyEnum[keyof typeof ReimportMcpToolsDtoConflictStrategyEnum];

/**
 * 
 * @export
 * @interface RemoveGlossaryKeywordDto
 */
export interface RemoveGlossaryKeywordDto {
    /**
     * 
     * @type {string}
     * @memberof RemoveGlossaryKeywordDto
     */
    keyword: string;
}
/**
 * 
 * @export
 * @interface ResolveConversationToolPermissionDto
 */
export interface ResolveConversationToolPermissionDto {
    /**
     * 
     * @type {string}
     * @memberof ResolveConversationToolPermissionDto
     */
    action: ResolveConversationToolPermissionDtoActionEnum;
    /**
     * 
     * @type {string}
     * @memberof ResolveConversationToolPermissionDto
     */
    rememberScope?: ResolveConversationToolPermissionDtoRememberScopeEnum;
}


/**
 * @export
 */
export const ResolveConversationToolPermissionDtoActionEnum = {
    Approve: 'approve',
    Deny: 'deny'
} as const;
export type ResolveConversationToolPermissionDtoActionEnum = typeof ResolveConversationToolPermissionDtoActionEnum[keyof typeof ResolveConversationToolPermissionDtoActionEnum];

/**
 * @export
 */
export const ResolveConversationToolPermissionDtoRememberScopeEnum = {
    None: 'none',
    ConversationCategory: 'conversation_category'
} as const;
export type ResolveConversationToolPermissionDtoRememberScopeEnum = typeof ResolveConversationToolPermissionDtoRememberScopeEnum[keyof typeof ResolveConversationToolPermissionDtoRememberScopeEnum];

/**
 * 
 * @export
 * @interface ResolveToolPermissionDto
 */
export interface ResolveToolPermissionDto {
    /**
     * 
     * @type {string}
     * @memberof ResolveToolPermissionDto
     */
    action: ResolveToolPermissionDtoActionEnum;
    /**
     * 
     * @type {string}
     * @memberof ResolveToolPermissionDto
     */
    rememberScope?: ResolveToolPermissionDtoRememberScopeEnum;
}


/**
 * @export
 */
export const ResolveToolPermissionDtoActionEnum = {
    Approve: 'approve',
    Deny: 'deny'
} as const;
export type ResolveToolPermissionDtoActionEnum = typeof ResolveToolPermissionDtoActionEnum[keyof typeof ResolveToolPermissionDtoActionEnum];

/**
 * @export
 */
export const ResolveToolPermissionDtoRememberScopeEnum = {
    None: 'none',
    ConversationCategory: 'conversation_category'
} as const;
export type ResolveToolPermissionDtoRememberScopeEnum = typeof ResolveToolPermissionDtoRememberScopeEnum[keyof typeof ResolveToolPermissionDtoRememberScopeEnum];

/**
 * 
 * @export
 * @interface ResumeExecutionDto
 */
export interface ResumeExecutionDto {
    /**
     * 指定从此节点开始恢复，重置该节点及所有下游节点
     * @type {string}
     * @memberof ResumeExecutionDto
     */
    fromNodeId?: string;
}
/**
 * 
 * @export
 * @interface ReviewVersionDto
 */
export interface ReviewVersionDto {
    /**
     * 
     * @type {string}
     * @memberof ReviewVersionDto
     */
    action: ReviewVersionDtoActionEnum;
}


/**
 * @export
 */
export const ReviewVersionDtoActionEnum = {
    Approve: 'approve',
    Reject: 'reject'
} as const;
export type ReviewVersionDtoActionEnum = typeof ReviewVersionDtoActionEnum[keyof typeof ReviewVersionDtoActionEnum];

/**
 * 
 * @export
 * @interface RollbackVersionDto
 */
export interface RollbackVersionDto {
    /**
     * 
     * @type {string}
     * @memberof RollbackVersionDto
     */
    targetVersionId: string;
}
/**
 * 
 * @export
 * @interface RotateApiKeyDto
 */
export interface RotateApiKeyDto {
    /**
     * 
     * @type {string}
     * @memberof RotateApiKeyDto
     */
    apiKey: string;
}
/**
 * 
 * @export
 * @interface RunWorkflowDto
 */
export interface RunWorkflowDto {
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof RunWorkflowDto
     */
    inputParams?: { [key: string]: any; };
    /**
     * 
     * @type {string}
     * @memberof RunWorkflowDto
     */
    launchSource?: RunWorkflowDtoLaunchSourceEnum;
    /**
     * 
     * @type {number}
     * @memberof RunWorkflowDto
     */
    schemaVersion?: number;
}


/**
 * @export
 */
export const RunWorkflowDtoLaunchSourceEnum = {
    WebStudio: 'web-studio',
    Mobile: 'mobile',
    Api: 'api'
} as const;
export type RunWorkflowDtoLaunchSourceEnum = typeof RunWorkflowDtoLaunchSourceEnum[keyof typeof RunWorkflowDtoLaunchSourceEnum];

/**
 * 
 * @export
 * @interface SendMessageDto
 */
export interface SendMessageDto {
    /**
     * 
     * @type {string}
     * @memberof SendMessageDto
     */
    content: string;
    /**
     * 
     * @type {string}
     * @memberof SendMessageDto
     */
    role?: SendMessageDtoRoleEnum;
    /**
     * 
     * @type {string}
     * @memberof SendMessageDto
     */
    contentType?: SendMessageDtoContentTypeEnum;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof SendMessageDto
     */
    metadata?: { [key: string]: any; };
}


/**
 * @export
 */
export const SendMessageDtoRoleEnum = {
    User: 'user',
    Assistant: 'assistant',
    System: 'system',
    Tool: 'tool'
} as const;
export type SendMessageDtoRoleEnum = typeof SendMessageDtoRoleEnum[keyof typeof SendMessageDtoRoleEnum];

/**
 * @export
 */
export const SendMessageDtoContentTypeEnum = {
    Text: 'text',
    Image: 'image',
    File: 'file'
} as const;
export type SendMessageDtoContentTypeEnum = typeof SendMessageDtoContentTypeEnum[keyof typeof SendMessageDtoContentTypeEnum];

/**
 * 
 * @export
 * @interface SessionToolExecutionCallbackDto
 */
export interface SessionToolExecutionCallbackDto {
    /**
     * 
     * @type {string}
     * @memberof SessionToolExecutionCallbackDto
     */
    sessionId: string;
    /**
     * 
     * @type {string}
     * @memberof SessionToolExecutionCallbackDto
     */
    toolCallId: string;
    /**
     * 
     * @type {string}
     * @memberof SessionToolExecutionCallbackDto
     */
    toolName: string;
    /**
     * 
     * @type {any}
     * @memberof SessionToolExecutionCallbackDto
     */
    input?: any | null;
    /**
     * 
     * @type {string}
     * @memberof SessionToolExecutionCallbackDto
     */
    phase?: SessionToolExecutionCallbackDtoPhaseEnum;
}


/**
 * @export
 */
export const SessionToolExecutionCallbackDtoPhaseEnum = {
    Preflight: 'preflight',
    Execute: 'execute'
} as const;
export type SessionToolExecutionCallbackDtoPhaseEnum = typeof SessionToolExecutionCallbackDtoPhaseEnum[keyof typeof SessionToolExecutionCallbackDtoPhaseEnum];

/**
 * 
 * @export
 * @interface SmartRoutingStrategiesResponseDto
 */
export interface SmartRoutingStrategiesResponseDto {
    /**
     * 
     * @type {Array<SmartRoutingStrategiesResponseDtoDataInner>}
     * @memberof SmartRoutingStrategiesResponseDto
     */
    data: Array<SmartRoutingStrategiesResponseDtoDataInner>;
}
/**
 * 
 * @export
 * @interface SmartRoutingStrategiesResponseDtoDataInner
 */
export interface SmartRoutingStrategiesResponseDtoDataInner {
    /**
     * 
     * @type {string}
     * @memberof SmartRoutingStrategiesResponseDtoDataInner
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof SmartRoutingStrategiesResponseDtoDataInner
     */
    category: SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum;
    /**
     * 
     * @type {boolean}
     * @memberof SmartRoutingStrategiesResponseDtoDataInner
     */
    requiresEmbedding: boolean;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof SmartRoutingStrategiesResponseDtoDataInner
     */
    configSchema: { [key: string]: any; };
}


/**
 * @export
 */
export const SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum = {
    Simple: 'simple',
    Ml: 'ml',
    Rag: 'rag',
    Plugin: 'plugin'
} as const;
export type SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum = typeof SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum[keyof typeof SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum];

/**
 * 
 * @export
 * @interface SmartRoutingStrategyConfigSchemaResponseDto
 */
export interface SmartRoutingStrategyConfigSchemaResponseDto {
    /**
     * 
     * @type {SmartRoutingStrategyConfigSchemaResponseDtoData}
     * @memberof SmartRoutingStrategyConfigSchemaResponseDto
     */
    data: SmartRoutingStrategyConfigSchemaResponseDtoData;
}
/**
 * 
 * @export
 * @interface SmartRoutingStrategyConfigSchemaResponseDtoData
 */
export interface SmartRoutingStrategyConfigSchemaResponseDtoData {
    /**
     * 
     * @type {string}
     * @memberof SmartRoutingStrategyConfigSchemaResponseDtoData
     */
    name: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof SmartRoutingStrategyConfigSchemaResponseDtoData
     */
    configSchema: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface StartConversationDto
 */
export interface StartConversationDto {
    /**
     * 
     * @type {string}
     * @memberof StartConversationDto
     */
    title?: string;
    /**
     * 
     * @type {string}
     * @memberof StartConversationDto
     */
    content: string;
    /**
     * 
     * @type {string}
     * @memberof StartConversationDto
     */
    contentType?: StartConversationDtoContentTypeEnum;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof StartConversationDto
     */
    metadata?: { [key: string]: any; };
}


/**
 * @export
 */
export const StartConversationDtoContentTypeEnum = {
    Text: 'text',
    Image: 'image',
    File: 'file'
} as const;
export type StartConversationDtoContentTypeEnum = typeof StartConversationDtoContentTypeEnum[keyof typeof StartConversationDtoContentTypeEnum];

/**
 * 
 * @export
 * @interface StartGeneratedAppGenerationRunDto
 */
export interface StartGeneratedAppGenerationRunDto {
    /**
     * 
     * @type {string}
     * @memberof StartGeneratedAppGenerationRunDto
     */
    triggerSource?: StartGeneratedAppGenerationRunDtoTriggerSourceEnum;
    /**
     * 
     * @type {number}
     * @memberof StartGeneratedAppGenerationRunDto
     */
    maxRepairAttempts?: number;
    /**
     * 
     * @type {number}
     * @memberof StartGeneratedAppGenerationRunDto
     */
    maxRuntimeSeconds?: number;
}


/**
 * @export
 */
export const StartGeneratedAppGenerationRunDtoTriggerSourceEnum = {
    Initial: 'initial',
    Manual: 'manual',
    Retry: 'retry',
    System: 'system'
} as const;
export type StartGeneratedAppGenerationRunDtoTriggerSourceEnum = typeof StartGeneratedAppGenerationRunDtoTriggerSourceEnum[keyof typeof StartGeneratedAppGenerationRunDtoTriggerSourceEnum];

/**
 * 
 * @export
 * @interface SubmitMarketplaceListingDto
 */
export interface SubmitMarketplaceListingDto {
    /**
     * 
     * @type {string}
     * @memberof SubmitMarketplaceListingDto
     */
    workflowVersionId: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitMarketplaceListingDto
     */
    title: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitMarketplaceListingDto
     */
    summary: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof SubmitMarketplaceListingDto
     */
    tags: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof SubmitMarketplaceListingDto
     */
    coverImageUrl?: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitMarketplaceListingDto
     */
    category?: SubmitMarketplaceListingDtoCategoryEnum;
}


/**
 * @export
 */
export const SubmitMarketplaceListingDtoCategoryEnum = {
    Analysis: 'analysis',
    Content: 'content',
    Development: 'development',
    Automation: 'automation',
    Reporting: 'reporting'
} as const;
export type SubmitMarketplaceListingDtoCategoryEnum = typeof SubmitMarketplaceListingDtoCategoryEnum[keyof typeof SubmitMarketplaceListingDtoCategoryEnum];

/**
 * 
 * @export
 * @interface SubmitPluginListingDto
 */
export interface SubmitPluginListingDto {
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    pluginDbId: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    title: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    summary: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    description?: string;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    category?: SubmitPluginListingDtoCategoryEnum;
    /**
     * 
     * @type {Array<string>}
     * @memberof SubmitPluginListingDto
     */
    tags?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    pricingModel: SubmitPluginListingDtoPricingModelEnum;
    /**
     * 
     * @type {string}
     * @memberof SubmitPluginListingDto
     */
    pricePerExecution?: string;
}


/**
 * @export
 */
export const SubmitPluginListingDtoCategoryEnum = {
    Analysis: 'analysis',
    Content: 'content',
    Development: 'development',
    Automation: 'automation',
    Reporting: 'reporting'
} as const;
export type SubmitPluginListingDtoCategoryEnum = typeof SubmitPluginListingDtoCategoryEnum[keyof typeof SubmitPluginListingDtoCategoryEnum];

/**
 * @export
 */
export const SubmitPluginListingDtoPricingModelEnum = {
    Free: 'free',
    PerExecution: 'per_execution'
} as const;
export type SubmitPluginListingDtoPricingModelEnum = typeof SubmitPluginListingDtoPricingModelEnum[keyof typeof SubmitPluginListingDtoPricingModelEnum];

/**
 * 
 * @export
 * @interface SubmitReviewDto
 */
export interface SubmitReviewDto {
    /**
     * 
     * @type {number}
     * @memberof SubmitReviewDto
     */
    rating: number;
    /**
     * 
     * @type {string}
     * @memberof SubmitReviewDto
     */
    content?: string;
}
/**
 * 
 * @export
 * @interface TenantKeyDetailResponseDto
 */
export interface TenantKeyDetailResponseDto {
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    orgId: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    keyFingerprint: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    status: TenantKeyDetailResponseDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    activatedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    rotatedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    revokedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    createdAt: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    updatedAt: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyDetailResponseDto
     */
    publicKey: string;
}


/**
 * @export
 */
export const TenantKeyDetailResponseDtoStatusEnum = {
    Active: 'active',
    Rotating: 'rotating',
    Revoked: 'revoked'
} as const;
export type TenantKeyDetailResponseDtoStatusEnum = typeof TenantKeyDetailResponseDtoStatusEnum[keyof typeof TenantKeyDetailResponseDtoStatusEnum];

/**
 * 
 * @export
 * @interface TenantKeyResponseDto
 */
export interface TenantKeyResponseDto {
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    orgId: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    keyFingerprint: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    status: TenantKeyResponseDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    activatedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    rotatedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    revokedAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    createdAt: string;
    /**
     * 
     * @type {string}
     * @memberof TenantKeyResponseDto
     */
    updatedAt: string;
}


/**
 * @export
 */
export const TenantKeyResponseDtoStatusEnum = {
    Active: 'active',
    Rotating: 'rotating',
    Revoked: 'revoked'
} as const;
export type TenantKeyResponseDtoStatusEnum = typeof TenantKeyResponseDtoStatusEnum[keyof typeof TenantKeyResponseDtoStatusEnum];

/**
 * 
 * @export
 * @interface TerminateExecutionRequestDto
 */
export interface TerminateExecutionRequestDto {
    /**
     * 
     * @type {string}
     * @memberof TerminateExecutionRequestDto
     */
    reason: string;
}
/**
 * 
 * @export
 * @interface TestKnowledgeSearchDto
 */
export interface TestKnowledgeSearchDto {
    /**
     * 
     * @type {string}
     * @memberof TestKnowledgeSearchDto
     */
    query: string;
    /**
     * 
     * @type {number}
     * @memberof TestKnowledgeSearchDto
     */
    topK?: number;
}
/**
 * 
 * @export
 * @interface TestMcpConnectionDto
 */
export interface TestMcpConnectionDto {
    /**
     * 
     * @type {TestMcpConnectionDtoConnection}
     * @memberof TestMcpConnectionDto
     */
    connection: TestMcpConnectionDtoConnection;
}
/**
 * @type TestMcpConnectionDtoConnection
 * 
 * @export
 */
export type TestMcpConnectionDtoConnection = TestMcpConnectionDtoConnectionOneOf | TestMcpConnectionDtoConnectionOneOf1 | TestMcpConnectionDtoConnectionOneOf2;
/**
 * 
 * @export
 * @interface TestMcpConnectionDtoConnectionOneOf
 */
export interface TestMcpConnectionDtoConnectionOneOf {
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf
     */
    transportType: TestMcpConnectionDtoConnectionOneOfTransportTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf
     */
    command: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof TestMcpConnectionDtoConnectionOneOf
     */
    args?: Array<string>;
    /**
     * 
     * @type {{ [key: string]: string; }}
     * @memberof TestMcpConnectionDtoConnectionOneOf
     */
    env?: { [key: string]: string; };
}


/**
 * @export
 */
export const TestMcpConnectionDtoConnectionOneOfTransportTypeEnum = {
    Stdio: 'stdio'
} as const;
export type TestMcpConnectionDtoConnectionOneOfTransportTypeEnum = typeof TestMcpConnectionDtoConnectionOneOfTransportTypeEnum[keyof typeof TestMcpConnectionDtoConnectionOneOfTransportTypeEnum];

/**
 * 
 * @export
 * @interface TestMcpConnectionDtoConnectionOneOf1
 */
export interface TestMcpConnectionDtoConnectionOneOf1 {
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf1
     */
    transportType: TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf1
     */
    url: string;
    /**
     * 
     * @type {{ [key: string]: string; }}
     * @memberof TestMcpConnectionDtoConnectionOneOf1
     */
    headers?: { [key: string]: string; };
}


/**
 * @export
 */
export const TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum = {
    Sse: 'sse'
} as const;
export type TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum = typeof TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum[keyof typeof TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum];

/**
 * 
 * @export
 * @interface TestMcpConnectionDtoConnectionOneOf2
 */
export interface TestMcpConnectionDtoConnectionOneOf2 {
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf2
     */
    transportType: TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof TestMcpConnectionDtoConnectionOneOf2
     */
    url: string;
    /**
     * 
     * @type {{ [key: string]: string; }}
     * @memberof TestMcpConnectionDtoConnectionOneOf2
     */
    headers?: { [key: string]: string; };
}


/**
 * @export
 */
export const TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum = {
    StreamableHttp: 'streamable_http'
} as const;
export type TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum = typeof TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum[keyof typeof TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum];

/**
 * 
 * @export
 * @interface TestProviderConnectionDto
 */
export interface TestProviderConnectionDto {
    /**
     * 
     * @type {number}
     * @memberof TestProviderConnectionDto
     */
    timeoutMs?: number;
}
/**
 * 
 * @export
 * @interface ToolPermissionCallbackDto
 */
export interface ToolPermissionCallbackDto {
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDto
     */
    sessionId?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDto
     */
    toolCallId: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDto
     */
    toolName: string;
    /**
     * 
     * @type {any}
     * @memberof ToolPermissionCallbackDto
     */
    input?: any | null;
    /**
     * 
     * @type {ToolPermissionCallbackDtoPermissionRequest}
     * @memberof ToolPermissionCallbackDto
     */
    permissionRequest?: ToolPermissionCallbackDtoPermissionRequest;
}
/**
 * 
 * @export
 * @interface ToolPermissionCallbackDtoPermissionRequest
 */
export interface ToolPermissionCallbackDtoPermissionRequest {
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    description: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    resourcePaths?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    domain?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    category?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    riskLevel?: ToolPermissionCallbackDtoPermissionRequestRiskLevelEnum;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    sourceLabel?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    targetType?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    targetLabel?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    approveEffect?: string;
    /**
     * 
     * @type {string}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    denyEffect?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    diffPreview?: { [key: string]: any; };
    /**
     * 
     * @type {boolean}
     * @memberof ToolPermissionCallbackDtoPermissionRequest
     */
    rememberable?: boolean;
}


/**
 * @export
 */
export const ToolPermissionCallbackDtoPermissionRequestRiskLevelEnum = {
    Low: 'low',
    Medium: 'medium',
    High: 'high'
} as const;
export type ToolPermissionCallbackDtoPermissionRequestRiskLevelEnum = typeof ToolPermissionCallbackDtoPermissionRequestRiskLevelEnum[keyof typeof ToolPermissionCallbackDtoPermissionRequestRiskLevelEnum];

/**
 * 
 * @export
 * @interface UnregisterDeviceDto
 */
export interface UnregisterDeviceDto {
    /**
     * 
     * @type {string}
     * @memberof UnregisterDeviceDto
     */
    deviceToken: string;
}
/**
 * 
 * @export
 * @interface UpdateConversationDto
 */
export interface UpdateConversationDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateConversationDto
     */
    title?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateConversationDto
     */
    metadata?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface UpdateGeneratedAppGenerationRunDto
 */
export interface UpdateGeneratedAppGenerationRunDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppGenerationRunDto
     */
    status?: UpdateGeneratedAppGenerationRunDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppGenerationRunDto
     */
    summary?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppGenerationRunDto
     */
    failureReason?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppGenerationRunDto
     */
    startedAt?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppGenerationRunDto
     */
    completedAt?: string | null;
}


/**
 * @export
 */
export const UpdateGeneratedAppGenerationRunDtoStatusEnum = {
    Queued: 'queued',
    Running: 'running',
    Repairing: 'repairing',
    Passed: 'passed',
    Failed: 'failed',
    Cancelled: 'cancelled'
} as const;
export type UpdateGeneratedAppGenerationRunDtoStatusEnum = typeof UpdateGeneratedAppGenerationRunDtoStatusEnum[keyof typeof UpdateGeneratedAppGenerationRunDtoStatusEnum];

/**
 * 
 * @export
 * @interface UpdateGeneratedAppRepairAttemptDto
 */
export interface UpdateGeneratedAppRepairAttemptDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    status?: UpdateGeneratedAppRepairAttemptDtoStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    failureSummary?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    changeSummary?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    verificationSummary?: string | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    repairPlan?: { [key: string]: any; } | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    reverificationPlan?: { [key: string]: any; } | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    startedAt?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateGeneratedAppRepairAttemptDto
     */
    completedAt?: string | null;
}


/**
 * @export
 */
export const UpdateGeneratedAppRepairAttemptDtoStatusEnum = {
    Planned: 'planned',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed',
    Skipped: 'skipped'
} as const;
export type UpdateGeneratedAppRepairAttemptDtoStatusEnum = typeof UpdateGeneratedAppRepairAttemptDtoStatusEnum[keyof typeof UpdateGeneratedAppRepairAttemptDtoStatusEnum];

/**
 * 
 * @export
 * @interface UpdateKnowledgeBaseSettingsDto
 */
export interface UpdateKnowledgeBaseSettingsDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    embeddingModel?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    embeddingModelConfigId?: string | null;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoChunkingStrategy}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    chunkingStrategy?: CreateKnowledgeBaseDtoChunkingStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoRetrievalStrategy}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    retrievalStrategy?: CreateKnowledgeBaseDtoRetrievalStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoRerankingStrategy}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    rerankingStrategy?: CreateKnowledgeBaseDtoRerankingStrategy;
    /**
     * 
     * @type {CreateKnowledgeBaseDtoQueryOrchestration}
     * @memberof UpdateKnowledgeBaseSettingsDto
     */
    queryOrchestration?: CreateKnowledgeBaseDtoQueryOrchestration;
}
/**
 * 
 * @export
 * @interface UpdateLlmModelConfigDto
 */
export interface UpdateLlmModelConfigDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmModelConfigDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmModelConfigDto
     */
    providerId?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmModelConfigDto
     */
    modelId?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateLlmModelConfigDto
     */
    parameters?: { [key: string]: any; };
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDto
     */
    isDefault?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDto
     */
    isEnabled?: boolean;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmModelConfigDto
     */
    modelType?: UpdateLlmModelConfigDtoModelTypeEnum;
    /**
     * 
     * @type {UpdateLlmModelConfigDtoCapabilities}
     * @memberof UpdateLlmModelConfigDto
     */
    capabilities?: UpdateLlmModelConfigDtoCapabilities;
    /**
     * 
     * @type {number}
     * @memberof UpdateLlmModelConfigDto
     */
    contextWindow?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpdateLlmModelConfigDto
     */
    maxOutputTokens?: number | null;
    /**
     * 
     * @type {CreateLlmModelConfigDtoPricing}
     * @memberof UpdateLlmModelConfigDto
     */
    pricing?: CreateLlmModelConfigDtoPricing | null;
    /**
     * 
     * @type {number}
     * @memberof UpdateLlmModelConfigDto
     */
    timeoutMs?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpdateLlmModelConfigDto
     */
    embeddingDimensions?: number | null;
}


/**
 * @export
 */
export const UpdateLlmModelConfigDtoModelTypeEnum = {
    Chat: 'chat',
    Embedding: 'embedding'
} as const;
export type UpdateLlmModelConfigDtoModelTypeEnum = typeof UpdateLlmModelConfigDtoModelTypeEnum[keyof typeof UpdateLlmModelConfigDtoModelTypeEnum];

/**
 * 
 * @export
 * @interface UpdateLlmModelConfigDtoCapabilities
 */
export interface UpdateLlmModelConfigDtoCapabilities {
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDtoCapabilities
     */
    vision?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDtoCapabilities
     */
    functionCalling?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDtoCapabilities
     */
    reasoning?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmModelConfigDtoCapabilities
     */
    structuredOutput?: boolean;
}
/**
 * 
 * @export
 * @interface UpdateLlmProviderDto
 */
export interface UpdateLlmProviderDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    slug?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    baseUrl?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    apiProtocol?: UpdateLlmProviderDtoApiProtocolEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    apiKeyId?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    apiKey?: string;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmProviderDto
     */
    clearApiKey?: boolean;
    /**
     * 
     * @type {string}
     * @memberof UpdateLlmProviderDto
     */
    iconUrl?: string;
    /**
     * 
     * @type {number}
     * @memberof UpdateLlmProviderDto
     */
    sortOrder?: number;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateLlmProviderDto
     */
    isEnabled?: boolean;
}


/**
 * @export
 */
export const UpdateLlmProviderDtoApiProtocolEnum = {
    OpenaiChat: 'openai_chat',
    OpenaiResponses: 'openai_responses',
    Anthropic: 'anthropic',
    Google: 'google',
    Cohere: 'cohere'
} as const;
export type UpdateLlmProviderDtoApiProtocolEnum = typeof UpdateLlmProviderDtoApiProtocolEnum[keyof typeof UpdateLlmProviderDtoApiProtocolEnum];

/**
 * 
 * @export
 * @interface UpdateMemberRoleDto
 */
export interface UpdateMemberRoleDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateMemberRoleDto
     */
    role: UpdateMemberRoleDtoRoleEnum;
}


/**
 * @export
 */
export const UpdateMemberRoleDtoRoleEnum = {
    Owner: 'owner',
    Admin: 'admin',
    Creator: 'creator',
    Operator: 'operator',
    Viewer: 'viewer'
} as const;
export type UpdateMemberRoleDtoRoleEnum = typeof UpdateMemberRoleDtoRoleEnum[keyof typeof UpdateMemberRoleDtoRoleEnum];

/**
 * 
 * @export
 * @interface UpdateMemoryInstanceDto
 */
export interface UpdateMemoryInstanceDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateMemoryInstanceDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateMemoryInstanceDto
     */
    description?: string | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateMemoryInstanceDto
     */
    config?: { [key: string]: any; };
    /**
     * 
     * @type {string}
     * @memberof UpdateMemoryInstanceDto
     */
    systemPromptOverride?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof UpdateMemoryInstanceDto
     */
    validDomains?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof UpdateMemoryInstanceDto
     */
    coreMemoryUris?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof UpdateMemoryInstanceDto
     */
    status?: UpdateMemoryInstanceDtoStatusEnum;
}


/**
 * @export
 */
export const UpdateMemoryInstanceDtoStatusEnum = {
    Active: 'active',
    Archived: 'archived'
} as const;
export type UpdateMemoryInstanceDtoStatusEnum = typeof UpdateMemoryInstanceDtoStatusEnum[keyof typeof UpdateMemoryInstanceDtoStatusEnum];

/**
 * 
 * @export
 * @interface UpdateOrganizationAutonomyPolicyDto
 */
export interface UpdateOrganizationAutonomyPolicyDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateOrganizationAutonomyPolicyDto
     */
    autonomyCap: UpdateOrganizationAutonomyPolicyDtoAutonomyCapEnum;
}


/**
 * @export
 */
export const UpdateOrganizationAutonomyPolicyDtoAutonomyCapEnum = {
    ManualConfirm: 'MANUAL_CONFIRM',
    RuleBased: 'RULE_BASED',
    LlmSuggest: 'LLM_SUGGEST'
} as const;
export type UpdateOrganizationAutonomyPolicyDtoAutonomyCapEnum = typeof UpdateOrganizationAutonomyPolicyDtoAutonomyCapEnum[keyof typeof UpdateOrganizationAutonomyPolicyDtoAutonomyCapEnum];

/**
 * 
 * @export
 * @interface UpdatePluginListingDto
 */
export interface UpdatePluginListingDto {
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    pluginDbId?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    title?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    summary?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    description?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    category?: UpdatePluginListingDtoCategoryEnum;
    /**
     * 
     * @type {Array<string>}
     * @memberof UpdatePluginListingDto
     */
    tags?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    pricingModel?: UpdatePluginListingDtoPricingModelEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginListingDto
     */
    pricePerExecution?: string;
    /**
     * 
     * @type {number}
     * @memberof UpdatePluginListingDto
     */
    occVersion?: number;
}


/**
 * @export
 */
export const UpdatePluginListingDtoCategoryEnum = {
    Analysis: 'analysis',
    Content: 'content',
    Development: 'development',
    Automation: 'automation',
    Reporting: 'reporting'
} as const;
export type UpdatePluginListingDtoCategoryEnum = typeof UpdatePluginListingDtoCategoryEnum[keyof typeof UpdatePluginListingDtoCategoryEnum];

/**
 * @export
 */
export const UpdatePluginListingDtoPricingModelEnum = {
    Free: 'free',
    PerExecution: 'per_execution'
} as const;
export type UpdatePluginListingDtoPricingModelEnum = typeof UpdatePluginListingDtoPricingModelEnum[keyof typeof UpdatePluginListingDtoPricingModelEnum];

/**
 * 
 * @export
 * @interface UpdatePluginStatusDto
 */
export interface UpdatePluginStatusDto {
    /**
     * 
     * @type {string}
     * @memberof UpdatePluginStatusDto
     */
    status: UpdatePluginStatusDtoStatusEnum;
    /**
     * 
     * @type {number}
     * @memberof UpdatePluginStatusDto
     */
    occVersion: number;
}


/**
 * @export
 */
export const UpdatePluginStatusDtoStatusEnum = {
    Registered: 'registered',
    Active: 'active',
    Disabled: 'disabled',
    Error: 'error'
} as const;
export type UpdatePluginStatusDtoStatusEnum = typeof UpdatePluginStatusDtoStatusEnum[keyof typeof UpdatePluginStatusDtoStatusEnum];

/**
 * 
 * @export
 * @interface UpdatePrivateDeploymentSettingsRequestDto
 */
export interface UpdatePrivateDeploymentSettingsRequestDto {
    /**
     * 
     * @type {UpdatePrivateDeploymentSettingsRequestDtoSmtp}
     * @memberof UpdatePrivateDeploymentSettingsRequestDto
     */
    smtp?: UpdatePrivateDeploymentSettingsRequestDtoSmtp;
    /**
     * 
     * @type {UpdatePrivateDeploymentSettingsRequestDtoLlmProxy}
     * @memberof UpdatePrivateDeploymentSettingsRequestDto
     */
    llmProxy?: UpdatePrivateDeploymentSettingsRequestDtoLlmProxy;
    /**
     * 
     * @type {UpdatePrivateDeploymentSettingsRequestDtoCertificates}
     * @memberof UpdatePrivateDeploymentSettingsRequestDto
     */
    certificates?: UpdatePrivateDeploymentSettingsRequestDtoCertificates;
    /**
     * 
     * @type {UpdatePrivateDeploymentSettingsRequestDtoLicense}
     * @memberof UpdatePrivateDeploymentSettingsRequestDto
     */
    license?: UpdatePrivateDeploymentSettingsRequestDtoLicense;
}
/**
 * 
 * @export
 * @interface UpdatePrivateDeploymentSettingsRequestDtoCertificates
 */
export interface UpdatePrivateDeploymentSettingsRequestDtoCertificates {
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoCertificates
     */
    source: UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoCertificates
     */
    tlsSecretRef: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoCertificates
     */
    expiresAt: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoCertificates
     */
    certificatePem?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoCertificates
     */
    privateKeyPem?: string | null;
}


/**
 * @export
 */
export const UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum = {
    Uploaded: 'uploaded',
    SecretRef: 'secretRef',
    IngressManaged: 'ingress-managed'
} as const;
export type UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum = typeof UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum[keyof typeof UpdatePrivateDeploymentSettingsRequestDtoCertificatesSourceEnum];

/**
 * 
 * @export
 * @interface UpdatePrivateDeploymentSettingsRequestDtoLicense
 */
export interface UpdatePrivateDeploymentSettingsRequestDtoLicense {
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLicense
     */
    licenseKey: string | null;
}
/**
 * 
 * @export
 * @interface UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
 */
export interface UpdatePrivateDeploymentSettingsRequestDtoLlmProxy {
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
     */
    mode: UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
     */
    baseUrl: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
     */
    apiKeySecretRef?: string | null;
    /**
     * 
     * @type {boolean}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
     */
    allowExternalEgress: boolean;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoLlmProxy
     */
    apiKey?: string | null;
}


/**
 * @export
 */
export const UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum = {
    Direct: 'direct',
    PrivateCloud: 'private_cloud',
    EnterpriseProxy: 'enterprise_proxy'
} as const;
export type UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum = typeof UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum[keyof typeof UpdatePrivateDeploymentSettingsRequestDtoLlmProxyModeEnum];

/**
 * 
 * @export
 * @interface UpdatePrivateDeploymentSettingsRequestDtoSmtp
 */
export interface UpdatePrivateDeploymentSettingsRequestDtoSmtp {
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    host: string | null;
    /**
     * 
     * @type {number}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    port: number | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    username: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    passwordSecretRef?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    fromEmail: string | null;
    /**
     * 
     * @type {boolean}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    useTls: boolean;
    /**
     * 
     * @type {string}
     * @memberof UpdatePrivateDeploymentSettingsRequestDtoSmtp
     */
    password?: string | null;
}
/**
 * 
 * @export
 * @interface UpdateReusableBlockDto
 */
export interface UpdateReusableBlockDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDto
     */
    description?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDto
     */
    category?: UpdateReusableBlockDtoCategoryEnum | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof UpdateReusableBlockDto
     */
    tags?: Array<string>;
    /**
     * 
     * @type {CreateReusableBlockDtoDefinition}
     * @memberof UpdateReusableBlockDto
     */
    definition?: CreateReusableBlockDtoDefinition;
    /**
     * 
     * @type {UpdateReusableBlockDtoMetadata}
     * @memberof UpdateReusableBlockDto
     */
    metadata?: UpdateReusableBlockDtoMetadata | null;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateReusableBlockDto
     */
    isPublished?: boolean;
    /**
     * 
     * @type {number}
     * @memberof UpdateReusableBlockDto
     */
    version: number;
}


/**
 * @export
 */
export const UpdateReusableBlockDtoCategoryEnum = {
    Analysis: 'analysis',
    Content: 'content',
    Development: 'development',
    Automation: 'automation',
    Reporting: 'reporting'
} as const;
export type UpdateReusableBlockDtoCategoryEnum = typeof UpdateReusableBlockDtoCategoryEnum[keyof typeof UpdateReusableBlockDtoCategoryEnum];

/**
 * 
 * @export
 * @interface UpdateReusableBlockDtoMetadata
 */
export interface UpdateReusableBlockDtoMetadata {
    /**
     * 
     * @type {number}
     * @memberof UpdateReusableBlockDtoMetadata
     */
    nodeCount: number;
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDtoMetadata
     */
    author?: string;
    /**
     * 
     * @type {number}
     * @memberof UpdateReusableBlockDtoMetadata
     */
    version: number;
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDtoMetadata
     */
    createdFromWorkflowId?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateReusableBlockDtoMetadata
     */
    exportedAt?: string;
}
/**
 * 
 * @export
 * @interface UpdateTriggerDto
 */
export interface UpdateTriggerDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateTriggerDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateTriggerDto
     */
    description?: string | null;
    /**
     * 
     * @type {CreateTriggerDtoConfig}
     * @memberof UpdateTriggerDto
     */
    config?: CreateTriggerDtoConfig;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateTriggerDto
     */
    isEnabled?: boolean;
}
/**
 * 
 * @export
 * @interface UpdateUserPreferenceDto
 */
export interface UpdateUserPreferenceDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateUserPreferenceDto
     */
    titleModelConfigId?: string | null;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof UpdateUserPreferenceDto
     */
    preferences?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDto
 */
export interface UpdateWorkflowDefinitionDto {
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDto
     */
    name?: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDto
     */
    description?: string | null;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDto
     */
    icon?: string | null;
    /**
     * 
     * @type {Array<{ [key: string]: any; }>}
     * @memberof UpdateWorkflowDefinitionDto
     */
    nodes?: Array<{ [key: string]: any; }>;
    /**
     * 
     * @type {Array<{ [key: string]: any; }>}
     * @memberof UpdateWorkflowDefinitionDto
     */
    edges?: Array<{ [key: string]: any; }>;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoViewport}
     * @memberof UpdateWorkflowDefinitionDto
     */
    viewport?: UpdateWorkflowDefinitionDtoViewport | null;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoInputSchema}
     * @memberof UpdateWorkflowDefinitionDto
     */
    inputSchema?: UpdateWorkflowDefinitionDtoInputSchema;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDto
     */
    version: number;
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchema
 */
export interface UpdateWorkflowDefinitionDtoInputSchema {
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchema
     */
    version?: number;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchema
     */
    collectionMode?: UpdateWorkflowDefinitionDtoInputSchemaCollectionModeEnum;
    /**
     * 
     * @type {Array<UpdateWorkflowDefinitionDtoInputSchemaFieldsInner>}
     * @memberof UpdateWorkflowDefinitionDtoInputSchema
     */
    fields?: Array<UpdateWorkflowDefinitionDtoInputSchemaFieldsInner>;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoInputSchemaConversationPlan}
     * @memberof UpdateWorkflowDefinitionDtoInputSchema
     */
    conversationPlan?: UpdateWorkflowDefinitionDtoInputSchemaConversationPlan;
}


/**
 * @export
 */
export const UpdateWorkflowDefinitionDtoInputSchemaCollectionModeEnum = {
    Form: 'form',
    Conversation: 'conversation',
    Hybrid: 'hybrid'
} as const;
export type UpdateWorkflowDefinitionDtoInputSchemaCollectionModeEnum = typeof UpdateWorkflowDefinitionDtoInputSchemaCollectionModeEnum[keyof typeof UpdateWorkflowDefinitionDtoInputSchemaCollectionModeEnum];

/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchemaConversationPlan
 */
export interface UpdateWorkflowDefinitionDtoInputSchemaConversationPlan {
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaConversationPlan
     */
    systemPrompt: string;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaConversationPlan
     */
    maxTurns: number;
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
 */
export interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInner {
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    type: UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    description?: string;
    /**
     * 
     * @type {boolean}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    required?: boolean;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    validation?: UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation;
    /**
     * 
     * @type {Array<string>}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    options?: Array<string>;
    /**
     * 
     * @type {any}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    _default?: any | null;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    visibility?: UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility;
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInner
     */
    collectionHint?: string;
}


/**
 * @export
 */
export const UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerTypeEnum = {
    Text: 'text',
    Number: 'number',
    SingleSelect: 'single_select',
    MultiSelect: 'multi_select'
} as const;
export type UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerTypeEnum = typeof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerTypeEnum[keyof typeof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerTypeEnum];

/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation
 */
export interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation {
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation
     */
    minLength?: number;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation
     */
    maxLength?: number;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation
     */
    min?: number;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerValidation
     */
    max?: number;
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility
 */
export interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility {
    /**
     * 
     * @type {string}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility
     */
    fieldId: string;
    /**
     * 
     * @type {UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibilityEquals}
     * @memberof UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibility
     */
    equals: UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibilityEquals;
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibilityEquals
 */
export interface UpdateWorkflowDefinitionDtoInputSchemaFieldsInnerVisibilityEquals {
}
/**
 * 
 * @export
 * @interface UpdateWorkflowDefinitionDtoViewport
 */
export interface UpdateWorkflowDefinitionDtoViewport {
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoViewport
     */
    x: number;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoViewport
     */
    y: number;
    /**
     * 
     * @type {number}
     * @memberof UpdateWorkflowDefinitionDtoViewport
     */
    zoom: number;
}
/**
 * 
 * @export
 * @interface UploadPublicKeyDto
 */
export interface UploadPublicKeyDto {
    /**
     * 
     * @type {string}
     * @memberof UploadPublicKeyDto
     */
    publicKey: string;
}
/**
 * 
 * @export
 * @interface UpsertExecutionGovernanceControlsRequestDto
 */
export interface UpsertExecutionGovernanceControlsRequestDto {
    /**
     * 
     * @type {UpsertExecutionGovernanceControlsRequestDtoTenantControl}
     * @memberof UpsertExecutionGovernanceControlsRequestDto
     */
    tenantControl?: UpsertExecutionGovernanceControlsRequestDtoTenantControl;
    /**
     * 
     * @type {Array<UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner>}
     * @memberof UpsertExecutionGovernanceControlsRequestDto
     */
    workflowControls?: Array<UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner>;
}
/**
 * 
 * @export
 * @interface UpsertExecutionGovernanceControlsRequestDtoTenantControl
 */
export interface UpsertExecutionGovernanceControlsRequestDtoTenantControl {
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoTenantControl
     */
    status: UpsertExecutionGovernanceControlsRequestDtoTenantControlStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoTenantControl
     */
    reason: string | null;
}


/**
 * @export
 */
export const UpsertExecutionGovernanceControlsRequestDtoTenantControlStatusEnum = {
    Active: 'active',
    Paused: 'paused'
} as const;
export type UpsertExecutionGovernanceControlsRequestDtoTenantControlStatusEnum = typeof UpsertExecutionGovernanceControlsRequestDtoTenantControlStatusEnum[keyof typeof UpsertExecutionGovernanceControlsRequestDtoTenantControlStatusEnum];

/**
 * 
 * @export
 * @interface UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner
 */
export interface UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner {
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner
     */
    scope: UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerScopeEnum;
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner
     */
    targetId: string;
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner
     */
    status: UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner
     */
    reason: string | null;
}


/**
 * @export
 */
export const UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerScopeEnum = {
    Workflow: 'workflow'
} as const;
export type UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerScopeEnum = typeof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerScopeEnum[keyof typeof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerScopeEnum];

/**
 * @export
 */
export const UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerStatusEnum = {
    Active: 'active',
    Paused: 'paused'
} as const;
export type UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerStatusEnum = typeof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerStatusEnum[keyof typeof UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInnerStatusEnum];

/**
 * 
 * @export
 * @interface UpsertPreferenceDto
 */
export interface UpsertPreferenceDto {
    /**
     * 
     * @type {string}
     * @memberof UpsertPreferenceDto
     */
    type: UpsertPreferenceDtoTypeEnum;
    /**
     * 
     * @type {string}
     * @memberof UpsertPreferenceDto
     */
    channel: UpsertPreferenceDtoChannelEnum;
    /**
     * 
     * @type {boolean}
     * @memberof UpsertPreferenceDto
     */
    enabled: boolean;
}


/**
 * @export
 */
export const UpsertPreferenceDtoTypeEnum = {
    ExecutionCompleted: 'execution_completed',
    ExecutionFailed: 'execution_failed',
    InterventionRequired: 'intervention_required',
    ResourceGovernanceExecutionBlocked: 'resource_governance_execution_blocked',
    ResourceGovernanceQuotaUpdated: 'resource_governance_quota_updated',
    ResourceGovernanceControlsUpdated: 'resource_governance_controls_updated',
    ResourceGovernanceExecutionTerminated: 'resource_governance_execution_terminated',
    System: 'system'
} as const;
export type UpsertPreferenceDtoTypeEnum = typeof UpsertPreferenceDtoTypeEnum[keyof typeof UpsertPreferenceDtoTypeEnum];

/**
 * @export
 */
export const UpsertPreferenceDtoChannelEnum = {
    InApp: 'in_app',
    Email: 'email',
    Push: 'push'
} as const;
export type UpsertPreferenceDtoChannelEnum = typeof UpsertPreferenceDtoChannelEnum[keyof typeof UpsertPreferenceDtoChannelEnum];

/**
 * 
 * @export
 * @interface UpsertTenantQuotaRequestDto
 */
export interface UpsertTenantQuotaRequestDto {
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    apiRateLimitPerMinute?: number;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    maxConcurrentExecutions?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    dailyExecutionLimit?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    dailyApiCallLimit?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    storageQuotaMb?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    maxSandboxCpuPercent?: number | null;
    /**
     * 
     * @type {number}
     * @memberof UpsertTenantQuotaRequestDto
     */
    maxSandboxMemoryMb?: number | null;
}
