import 'package:freezed_annotation/freezed_annotation.dart';

import 'resource_envelope_decoder.dart';

part 'llm_dto.freezed.dart';
part 'llm_dto.g.dart';

const llmProviderIds = <String>['openai', 'anthropic', 'google', 'deepseek', 'custom', 'private_cloud'];
const llmApiProtocols = <String>['openai_chat', 'openai_responses', 'anthropic', 'google', 'cohere'];
const llmModelTypes = <String>['chat', 'embedding'];
const llmAuthMethods = <String>['api_key', 'mtls', 'none'];

@freezed
abstract class ApiKeyInfoDto with _$ApiKeyInfoDto {
  const factory ApiKeyInfoDto({required String id, required String provider, required String label, required String keyPreview, @Default(false) bool isDefault, required String status, String? lastUsedAt, String? rotatedAt, String? expiresAt, required String createdAt, required String updatedAt}) = _ApiKeyInfoDto;
  factory ApiKeyInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ApiKeyInfoDtoFromJson, name: 'ApiKeyInfoDto');
}

@freezed
abstract class LlmProviderInfoDto with _$LlmProviderInfoDto {
  const factory LlmProviderInfoDto({required String id, required String name, @Default(<String>[]) List<String> models, required String defaultModel, @Default(false) bool supportsStreaming, @Default(false) bool supportsStructuredOutput}) = _LlmProviderInfoDto;
  factory LlmProviderInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$LlmProviderInfoDtoFromJson, name: 'LlmProviderInfoDto');
}

@freezed
abstract class LlmParametersDto with _$LlmParametersDto {
  const factory LlmParametersDto({@Default(0.7) double temperature, int? maxTokens, @Default(1) double topP, @Default(0) double frequencyPenalty, @Default(0) double presencePenalty, @Default(<String>[]) List<String> stop}) = _LlmParametersDto;
  factory LlmParametersDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$LlmParametersDtoFromJson, name: 'LlmParametersDto');
}

@freezed
abstract class LlmModelInfoDto with _$LlmModelInfoDto {
  const factory LlmModelInfoDto({required String id, required String name, @Default('openai') String provider, @Default('chat') String modelType, required String modelName, @Default(LlmParametersDto()) LlmParametersDto parameters, String? apiKeyId, int? embeddingDimensions, @Default(false) bool isDefault, required String createdAt, required String updatedAt, String? endpointUrl, String? authMethod, Map<String, dynamic>? authConfig, int? timeoutMs}) = _LlmModelInfoDto;
  factory LlmModelInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$LlmModelInfoDtoFromJson, name: 'LlmModelInfoDto');
}

@freezed
abstract class PrivateCloudServerInfoDto with _$PrivateCloudServerInfoDto {
  const factory PrivateCloudServerInfoDto({@Default(<String>[]) List<String> models, String? status, String? version}) = _PrivateCloudServerInfoDto;
  factory PrivateCloudServerInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$PrivateCloudServerInfoDtoFromJson, name: 'PrivateCloudServerInfoDto');
}

@freezed
abstract class TestLlmConnectionResultDto with _$TestLlmConnectionResultDto {
  const factory TestLlmConnectionResultDto({required bool success, required int latencyMs, PrivateCloudServerInfoDto? serverInfo}) = _TestLlmConnectionResultDto;
  factory TestLlmConnectionResultDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$TestLlmConnectionResultDtoFromJson, name: 'TestLlmConnectionResultDto');
}

@freezed
abstract class PrivateCloudModelInfoDto with _$PrivateCloudModelInfoDto {
  const factory PrivateCloudModelInfoDto({required String id, required String name, String? ownedBy}) = _PrivateCloudModelInfoDto;
  factory PrivateCloudModelInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$PrivateCloudModelInfoDtoFromJson, name: 'PrivateCloudModelInfoDto');
}

@freezed
abstract class LlmProviderEntityDto with _$LlmProviderEntityDto {
  const factory LlmProviderEntityDto({required String id, required String orgId, required String tenantId, required String slug, required String name, String? iconUrl, String? baseUrl, String? defaultBaseUrl, @Default(false) bool isBuiltin, @Default(true) bool isEnabled, @Default('openai_chat') String apiProtocol, String? apiKeyId, @Default(0) int sortOrder, required String createdAt, required String updatedAt}) = _LlmProviderEntityDto;
  factory LlmProviderEntityDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$LlmProviderEntityDtoFromJson, name: 'LlmProviderEntityDto');
}

@freezed
abstract class ModelCapabilitiesDto with _$ModelCapabilitiesDto {
  const factory ModelCapabilitiesDto({@Default(false) bool vision, @Default(false) bool functionCalling, @Default(false) bool reasoning, @Default(false) bool structuredOutput}) = _ModelCapabilitiesDto;
  factory ModelCapabilitiesDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ModelCapabilitiesDtoFromJson, name: 'ModelCapabilitiesDto');
}

@freezed
abstract class PricingTierDto with _$PricingTierDto {
  const factory PricingTierDto({required int aboveTokens, required double inputPer1MTokens, required double outputPer1MTokens, double? cachedReadPer1MTokens, double? cachedWritePer1MTokens}) = _PricingTierDto;
  factory PricingTierDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$PricingTierDtoFromJson, name: 'PricingTierDto');
}

@freezed
abstract class ModelPricingDto with _$ModelPricingDto {
  const factory ModelPricingDto({required double inputPer1MTokens, required double outputPer1MTokens, double? cachedReadPer1MTokens, double? cachedWritePer1MTokens, @Default(<PricingTierDto>[]) List<PricingTierDto> tiers}) = _ModelPricingDto;
  factory ModelPricingDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$ModelPricingDtoFromJson, name: 'ModelPricingDto');
}

@freezed
abstract class LiteLLMModelInfoDto with _$LiteLLMModelInfoDto {
  const factory LiteLLMModelInfoDto({required String modelId, int? contextWindow, int? maxOutputTokens, ModelPricingDto? pricing, @Default(ModelCapabilitiesDto()) ModelCapabilitiesDto capabilities}) = _LiteLLMModelInfoDto;
  factory LiteLLMModelInfoDto.fromJson(Map<String, dynamic> json) => decodeResourceDto(json, _$LiteLLMModelInfoDtoFromJson, name: 'LiteLLMModelInfoDto');
}

@freezed
abstract class LlmModelConfigDto with _$LlmModelConfigDto {
  const factory LlmModelConfigDto({required String id, required String orgId, required String tenantId, required String providerId, required String name, required String modelId, @Default('chat') String modelType, @Default(true) bool isEnabled, @Default(false) bool isDefault, @Default(ModelCapabilitiesDto()) ModelCapabilitiesDto capabilities, int? contextWindow, int? maxOutputTokens, ModelPricingDto? pricing, @Default(<String, dynamic>{}) Map<String, dynamic> parameters, String? metadataSource, int? embeddingDimensions, int? timeoutMs, required String createdAt, required String updatedAt, LlmProviderEntityDto? provider}) = _LlmModelConfigDto;
  factory LlmModelConfigDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(_normalizeModelConfig(json), _$LlmModelConfigDtoFromJson, name: 'LlmModelConfigDto');
}

Map<String, dynamic> _normalizeModelConfig(Map<String, dynamic> json) {
  final normalized = Map<String, dynamic>.from(json);
  normalized['modelId'] ??= normalized['modelName'];
  return normalized;
}
