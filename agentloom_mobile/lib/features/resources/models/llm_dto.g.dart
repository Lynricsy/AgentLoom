// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'llm_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ApiKeyInfoDto _$ApiKeyInfoDtoFromJson(Map<String, dynamic> json) =>
    _ApiKeyInfoDto(
      id: json['id'] as String,
      provider: json['provider'] as String,
      label: json['label'] as String,
      keyPreview: json['keyPreview'] as String,
      isDefault: json['isDefault'] as bool? ?? false,
      status: json['status'] as String,
      lastUsedAt: json['lastUsedAt'] as String?,
      rotatedAt: json['rotatedAt'] as String?,
      expiresAt: json['expiresAt'] as String?,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$ApiKeyInfoDtoToJson(_ApiKeyInfoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'provider': instance.provider,
      'label': instance.label,
      'keyPreview': instance.keyPreview,
      'isDefault': instance.isDefault,
      'status': instance.status,
      'lastUsedAt': instance.lastUsedAt,
      'rotatedAt': instance.rotatedAt,
      'expiresAt': instance.expiresAt,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };

_LlmProviderInfoDto _$LlmProviderInfoDtoFromJson(
  Map<String, dynamic> json,
) => _LlmProviderInfoDto(
  id: json['id'] as String,
  name: json['name'] as String,
  models:
      (json['models'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  defaultModel: json['defaultModel'] as String,
  supportsStreaming: json['supportsStreaming'] as bool? ?? false,
  supportsStructuredOutput: json['supportsStructuredOutput'] as bool? ?? false,
);

Map<String, dynamic> _$LlmProviderInfoDtoToJson(_LlmProviderInfoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'models': instance.models,
      'defaultModel': instance.defaultModel,
      'supportsStreaming': instance.supportsStreaming,
      'supportsStructuredOutput': instance.supportsStructuredOutput,
    };

_LlmParametersDto _$LlmParametersDtoFromJson(Map<String, dynamic> json) =>
    _LlmParametersDto(
      temperature: (json['temperature'] as num?)?.toDouble() ?? 0.7,
      maxTokens: (json['maxTokens'] as num?)?.toInt(),
      topP: (json['topP'] as num?)?.toDouble() ?? 1,
      frequencyPenalty: (json['frequencyPenalty'] as num?)?.toDouble() ?? 0,
      presencePenalty: (json['presencePenalty'] as num?)?.toDouble() ?? 0,
      stop:
          (json['stop'] as List<dynamic>?)?.map((e) => e as String).toList() ??
          const <String>[],
    );

Map<String, dynamic> _$LlmParametersDtoToJson(_LlmParametersDto instance) =>
    <String, dynamic>{
      'temperature': instance.temperature,
      'maxTokens': instance.maxTokens,
      'topP': instance.topP,
      'frequencyPenalty': instance.frequencyPenalty,
      'presencePenalty': instance.presencePenalty,
      'stop': instance.stop,
    };

_LlmModelInfoDto _$LlmModelInfoDtoFromJson(Map<String, dynamic> json) =>
    _LlmModelInfoDto(
      id: json['id'] as String,
      name: json['name'] as String,
      provider: json['provider'] as String? ?? 'openai',
      modelType: json['modelType'] as String? ?? 'chat',
      modelName: json['modelName'] as String,
      parameters: json['parameters'] == null
          ? const LlmParametersDto()
          : LlmParametersDto.fromJson(
              json['parameters'] as Map<String, dynamic>,
            ),
      apiKeyId: json['apiKeyId'] as String?,
      embeddingDimensions: (json['embeddingDimensions'] as num?)?.toInt(),
      isDefault: json['isDefault'] as bool? ?? false,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
      endpointUrl: json['endpointUrl'] as String?,
      authMethod: json['authMethod'] as String?,
      authConfig: json['authConfig'] as Map<String, dynamic>?,
      timeoutMs: (json['timeoutMs'] as num?)?.toInt(),
    );

Map<String, dynamic> _$LlmModelInfoDtoToJson(_LlmModelInfoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'provider': instance.provider,
      'modelType': instance.modelType,
      'modelName': instance.modelName,
      'parameters': instance.parameters.toJson(),
      'apiKeyId': instance.apiKeyId,
      'embeddingDimensions': instance.embeddingDimensions,
      'isDefault': instance.isDefault,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
      'endpointUrl': instance.endpointUrl,
      'authMethod': instance.authMethod,
      'authConfig': instance.authConfig,
      'timeoutMs': instance.timeoutMs,
    };

_PrivateCloudServerInfoDto _$PrivateCloudServerInfoDtoFromJson(
  Map<String, dynamic> json,
) => _PrivateCloudServerInfoDto(
  models:
      (json['models'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  status: json['status'] as String?,
  version: json['version'] as String?,
);

Map<String, dynamic> _$PrivateCloudServerInfoDtoToJson(
  _PrivateCloudServerInfoDto instance,
) => <String, dynamic>{
  'models': instance.models,
  'status': instance.status,
  'version': instance.version,
};

_TestLlmConnectionResultDto _$TestLlmConnectionResultDtoFromJson(
  Map<String, dynamic> json,
) => _TestLlmConnectionResultDto(
  success: json['success'] as bool,
  latencyMs: (json['latencyMs'] as num).toInt(),
  serverInfo: json['serverInfo'] == null
      ? null
      : PrivateCloudServerInfoDto.fromJson(
          json['serverInfo'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$TestLlmConnectionResultDtoToJson(
  _TestLlmConnectionResultDto instance,
) => <String, dynamic>{
  'success': instance.success,
  'latencyMs': instance.latencyMs,
  'serverInfo': instance.serverInfo?.toJson(),
};

_PrivateCloudModelInfoDto _$PrivateCloudModelInfoDtoFromJson(
  Map<String, dynamic> json,
) => _PrivateCloudModelInfoDto(
  id: json['id'] as String,
  name: json['name'] as String,
  ownedBy: json['ownedBy'] as String?,
);

Map<String, dynamic> _$PrivateCloudModelInfoDtoToJson(
  _PrivateCloudModelInfoDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'ownedBy': instance.ownedBy,
};

_LlmProviderEntityDto _$LlmProviderEntityDtoFromJson(
  Map<String, dynamic> json,
) => _LlmProviderEntityDto(
  id: json['id'] as String,
  orgId: json['orgId'] as String,
  tenantId: json['tenantId'] as String,
  slug: json['slug'] as String,
  name: json['name'] as String,
  iconUrl: json['iconUrl'] as String?,
  baseUrl: json['baseUrl'] as String?,
  defaultBaseUrl: json['defaultBaseUrl'] as String?,
  isBuiltin: json['isBuiltin'] as bool? ?? false,
  isEnabled: json['isEnabled'] as bool? ?? true,
  apiProtocol: json['apiProtocol'] as String? ?? 'openai_chat',
  apiKeyId: json['apiKeyId'] as String?,
  sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$LlmProviderEntityDtoToJson(
  _LlmProviderEntityDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'orgId': instance.orgId,
  'tenantId': instance.tenantId,
  'slug': instance.slug,
  'name': instance.name,
  'iconUrl': instance.iconUrl,
  'baseUrl': instance.baseUrl,
  'defaultBaseUrl': instance.defaultBaseUrl,
  'isBuiltin': instance.isBuiltin,
  'isEnabled': instance.isEnabled,
  'apiProtocol': instance.apiProtocol,
  'apiKeyId': instance.apiKeyId,
  'sortOrder': instance.sortOrder,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

_ModelCapabilitiesDto _$ModelCapabilitiesDtoFromJson(
  Map<String, dynamic> json,
) => _ModelCapabilitiesDto(
  vision: json['vision'] as bool? ?? false,
  functionCalling: json['functionCalling'] as bool? ?? false,
  reasoning: json['reasoning'] as bool? ?? false,
  structuredOutput: json['structuredOutput'] as bool? ?? false,
);

Map<String, dynamic> _$ModelCapabilitiesDtoToJson(
  _ModelCapabilitiesDto instance,
) => <String, dynamic>{
  'vision': instance.vision,
  'functionCalling': instance.functionCalling,
  'reasoning': instance.reasoning,
  'structuredOutput': instance.structuredOutput,
};

_PricingTierDto _$PricingTierDtoFromJson(
  Map<String, dynamic> json,
) => _PricingTierDto(
  aboveTokens: (json['aboveTokens'] as num).toInt(),
  inputPer1MTokens: (json['inputPer1MTokens'] as num).toDouble(),
  outputPer1MTokens: (json['outputPer1MTokens'] as num).toDouble(),
  cachedReadPer1MTokens: (json['cachedReadPer1MTokens'] as num?)?.toDouble(),
  cachedWritePer1MTokens: (json['cachedWritePer1MTokens'] as num?)?.toDouble(),
);

Map<String, dynamic> _$PricingTierDtoToJson(_PricingTierDto instance) =>
    <String, dynamic>{
      'aboveTokens': instance.aboveTokens,
      'inputPer1MTokens': instance.inputPer1MTokens,
      'outputPer1MTokens': instance.outputPer1MTokens,
      'cachedReadPer1MTokens': instance.cachedReadPer1MTokens,
      'cachedWritePer1MTokens': instance.cachedWritePer1MTokens,
    };

_ModelPricingDto _$ModelPricingDtoFromJson(
  Map<String, dynamic> json,
) => _ModelPricingDto(
  inputPer1MTokens: (json['inputPer1MTokens'] as num).toDouble(),
  outputPer1MTokens: (json['outputPer1MTokens'] as num).toDouble(),
  cachedReadPer1MTokens: (json['cachedReadPer1MTokens'] as num?)?.toDouble(),
  cachedWritePer1MTokens: (json['cachedWritePer1MTokens'] as num?)?.toDouble(),
  tiers:
      (json['tiers'] as List<dynamic>?)
          ?.map((e) => PricingTierDto.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <PricingTierDto>[],
);

Map<String, dynamic> _$ModelPricingDtoToJson(_ModelPricingDto instance) =>
    <String, dynamic>{
      'inputPer1MTokens': instance.inputPer1MTokens,
      'outputPer1MTokens': instance.outputPer1MTokens,
      'cachedReadPer1MTokens': instance.cachedReadPer1MTokens,
      'cachedWritePer1MTokens': instance.cachedWritePer1MTokens,
      'tiers': instance.tiers.map((e) => e.toJson()).toList(),
    };

_LiteLLMModelInfoDto _$LiteLLMModelInfoDtoFromJson(Map<String, dynamic> json) =>
    _LiteLLMModelInfoDto(
      modelId: json['modelId'] as String,
      contextWindow: (json['contextWindow'] as num?)?.toInt(),
      maxOutputTokens: (json['maxOutputTokens'] as num?)?.toInt(),
      pricing: json['pricing'] == null
          ? null
          : ModelPricingDto.fromJson(json['pricing'] as Map<String, dynamic>),
      capabilities: json['capabilities'] == null
          ? const ModelCapabilitiesDto()
          : ModelCapabilitiesDto.fromJson(
              json['capabilities'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$LiteLLMModelInfoDtoToJson(
  _LiteLLMModelInfoDto instance,
) => <String, dynamic>{
  'modelId': instance.modelId,
  'contextWindow': instance.contextWindow,
  'maxOutputTokens': instance.maxOutputTokens,
  'pricing': instance.pricing?.toJson(),
  'capabilities': instance.capabilities.toJson(),
};

_LlmModelConfigDto _$LlmModelConfigDtoFromJson(
  Map<String, dynamic> json,
) => _LlmModelConfigDto(
  id: json['id'] as String,
  orgId: json['orgId'] as String,
  tenantId: json['tenantId'] as String,
  providerId: json['providerId'] as String,
  name: json['name'] as String,
  modelId: json['modelId'] as String,
  modelType: json['modelType'] as String? ?? 'chat',
  isEnabled: json['isEnabled'] as bool? ?? true,
  isDefault: json['isDefault'] as bool? ?? false,
  capabilities: json['capabilities'] == null
      ? const ModelCapabilitiesDto()
      : ModelCapabilitiesDto.fromJson(
          json['capabilities'] as Map<String, dynamic>,
        ),
  contextWindow: (json['contextWindow'] as num?)?.toInt(),
  maxOutputTokens: (json['maxOutputTokens'] as num?)?.toInt(),
  pricing: json['pricing'] == null
      ? null
      : ModelPricingDto.fromJson(json['pricing'] as Map<String, dynamic>),
  parameters:
      json['parameters'] as Map<String, dynamic>? ?? const <String, dynamic>{},
  metadataSource: json['metadataSource'] as String?,
  embeddingDimensions: (json['embeddingDimensions'] as num?)?.toInt(),
  timeoutMs: (json['timeoutMs'] as num?)?.toInt(),
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  provider: json['provider'] == null
      ? null
      : LlmProviderEntityDto.fromJson(json['provider'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LlmModelConfigDtoToJson(_LlmModelConfigDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'orgId': instance.orgId,
      'tenantId': instance.tenantId,
      'providerId': instance.providerId,
      'name': instance.name,
      'modelId': instance.modelId,
      'modelType': instance.modelType,
      'isEnabled': instance.isEnabled,
      'isDefault': instance.isDefault,
      'capabilities': instance.capabilities.toJson(),
      'contextWindow': instance.contextWindow,
      'maxOutputTokens': instance.maxOutputTokens,
      'pricing': instance.pricing?.toJson(),
      'parameters': instance.parameters,
      'metadataSource': instance.metadataSource,
      'embeddingDimensions': instance.embeddingDimensions,
      'timeoutMs': instance.timeoutMs,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
      'provider': instance.provider?.toJson(),
    };
