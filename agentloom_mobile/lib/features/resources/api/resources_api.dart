import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../agents/models/conversation_message_dto.dart';
import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/resource_dtos.dart';

const _emptyJsonBody = <String, dynamic>{};

Map<String, dynamic> _unwrapDataEnvelope(Response<dynamic> response) {
  final body = decodeResourceObject(response.data, path: 'response');
  if (!body.containsKey('data')) {
    throw const ApiContractException('response 缺少 data 字段');
  }
  return decodeResourceObject(body['data'], path: 'response.data');
}

List<Map<String, dynamic>> _unwrapListEnvelope(Response<dynamic> response) {
  return decodeResourceList(response.data, path: 'response');
}

PaginatedResponse<T> _decodePaginated<T>(
  Response<dynamic> response,
  T Function(Map<String, dynamic>) decode,
) {
  try {
    final body = decodeResourceObject(response.data, path: 'response');
    decodeResourceList(body, path: 'response');
    return PaginatedResponse.fromJson(body, (json) {
      if (json is! Map<String, dynamic>) {
        throw ApiContractException(
          'response.data 元素应为对象，实际为 ${json.runtimeType}',
        );
      }
      return decode(json);
    });
  } on ApiContractException {
    rethrow;
  } catch (error) {
    throw ApiContractException('分页响应不符合契约', cause: error);
  }
}

List<WorkspaceFileNode> _unwrapWorkspaceTreeEnvelope(
  Response<dynamic> response,
) {
  return _unwrapListEnvelope(
    response,
  ).map(WorkspaceFileNode.fromJson).toList(growable: false);
}

class ResourcesApi {
  ResourcesApi(this._dio);

  final Dio _dio;

  Future<PaginatedResponse<WorkspaceDto>> listWorkspaces({
    int page = 1,
    int pageSize = 20,
    String? search,
    bool includeAutoArchived = false,
  }) async {
    final response = await _dio.get(
      '/api/v1/workspaces',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        'includeAutoArchived': includeAutoArchived,
      },
    );
    return _decodePaginated(response, WorkspaceDto.fromJson);
  }

  Future<WorkspaceDto> createWorkspace({
    required String name,
    String? description,
  }) async {
    final response = await _dio.post(
      '/api/v1/workspaces',
      data: {
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
    return WorkspaceDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> deleteWorkspace(String workspaceId) async {
    await _dio.delete('/api/v1/workspaces/$workspaceId');
  }

  Future<List<WorkspaceFileNode>> getWorkspaceTree(String workspaceId) async {
    final response = await _dio.get('/api/v1/workspaces/$workspaceId/tree');
    return _unwrapWorkspaceTreeEnvelope(response);
  }

  Future<PaginatedResponse<SandboxSessionDto>> listSandboxes({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    String? lifecycleMode,
    String? bindingType,
  }) async {
    final response = await _dio.get(
      '/api/v1/sandboxes',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
        if (lifecycleMode != null && lifecycleMode.isNotEmpty)
          'lifecycleMode': lifecycleMode,
        if (bindingType != null && bindingType.isNotEmpty)
          'bindingType': bindingType,
      },
    );
    return _decodePaginated(response, SandboxSessionDto.fromJson);
  }

  Future<SandboxSessionDto> createSandbox({
    required String name,
    required double cpu,
    required int memory,
    required int disk,
  }) async {
    final response = await _dio.post(
      '/api/v1/sandboxes',
      data: {'name': name, 'cpu': cpu, 'memory': memory, 'disk': disk},
    );
    return SandboxSessionDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<SandboxStatsDto> getSandboxStats(String sessionId) async {
    final response = await _dio.get('/api/v1/sandboxes/$sessionId/stats');
    return SandboxStatsDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<List<SandboxLogDto>> getSandboxLogs(String sessionId) async {
    final response = await _dio.get('/api/v1/sandboxes/$sessionId/logs');
    return _unwrapListEnvelope(
      response,
    ).map(SandboxLogDto.fromJson).toList(growable: false);
  }

  Future<void> startSandbox(String sessionId) async {
    await _dio.post('/api/v1/sandboxes/$sessionId/start', data: _emptyJsonBody);
  }

  Future<void> stopSandbox(String sessionId) async {
    await _dio.post('/api/v1/sandboxes/$sessionId/stop', data: _emptyJsonBody);
  }

  Future<void> deleteSandbox(String sessionId) async {
    await _dio.delete('/api/v1/sandboxes/$sessionId');
  }

  Future<PaginatedResponse<KnowledgeBaseDto>> listKnowledgeBases({
    int page = 1,
    int pageSize = 20,
    String? sourceKind,
  }) async {
    final response = await _dio.get(
      '/api/v1/knowledge-bases',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (sourceKind != null && sourceKind.isNotEmpty)
          'sourceKind': sourceKind,
      },
    );
    return _decodePaginated(response, KnowledgeBaseDto.fromJson);
  }

  Future<KnowledgeBaseDto> createKnowledgeBase({
    required String name,
    String? description,
    String visibility = 'private',
  }) async {
    final response = await _dio.post(
      '/api/v1/knowledge-bases',
      data: {
        'name': name,
        'visibility': visibility,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
    return KnowledgeBaseDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<KnowledgeBaseDto> getKnowledgeBase(String knowledgeBaseId) async {
    final response = await _dio.get('/api/v1/knowledge-bases/$knowledgeBaseId');
    return KnowledgeBaseDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<PaginatedResponse<KnowledgeDocumentDto>> listKnowledgeDocuments(
    String knowledgeBaseId, {
    int page = 1,
    int pageSize = 20,
    String? status,
  }) async {
    final response = await _dio.get(
      '/api/v1/knowledge-bases/$knowledgeBaseId/documents',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    return _decodePaginated(response, KnowledgeDocumentDto.fromJson);
  }

  Future<void> rebuildKnowledgeBase(String knowledgeBaseId) async {
    await _dio.post(
      '/api/v1/knowledge-bases/$knowledgeBaseId/rebuild',
      data: {'force': true},
    );
  }

  Future<void> deleteKnowledgeBase(String knowledgeBaseId) async {
    await _dio.delete('/api/v1/knowledge-bases/$knowledgeBaseId');
  }

  Future<void> convertKnowledgeBaseSourceToManual(
    String knowledgeBaseId,
  ) async {
    await _dio.post(
      '/api/v1/resource-sources/knowledge_base/$knowledgeBaseId/convert-to-manual',
      data: _emptyJsonBody,
    );
  }

  Future<PaginatedResponse<McpServerConfigSummaryDto>> listMcpServerConfigs({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    String? transportType,
    String? sourceKind,
  }) async {
    final response = await _dio.get(
      '/api/v1/mcp/configs',
      queryParameters: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
        if (transportType != null && transportType.isNotEmpty)
          'transportType': transportType,
        if (sourceKind != null && sourceKind.isNotEmpty)
          'sourceKind': sourceKind,
      },
    );
    return _decodePaginated(response, McpServerConfigSummaryDto.fromJson);
  }

  Future<McpServerConfigDetailDto> getMcpServerConfig(String configId) async {
    final response = await _dio.get('/api/v1/mcp/configs/$configId');
    return McpServerConfigDetailDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<TestMcpConnectionResultDto> testSavedMcpConfigConnection(
    String configId,
  ) async {
    final response = await _dio.post(
      '/api/v1/mcp/configs/$configId/test',
      data: _emptyJsonBody,
    );
    return TestMcpConnectionResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<TestMcpConnectionResultDto> testMcpConnection(
    McpConnectionConfigDto connection,
  ) async {
    final response = await _dio.post(
      '/api/v1/mcp/test',
      data: {'connection': connection.toJson()},
    );
    return TestMcpConnectionResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<DiscoverMcpToolsResultDto> discoverMcpTools(
    McpConnectionConfigDto connection,
  ) async {
    final response = await _dio.post(
      '/api/v1/mcp/discover',
      data: {'connection': connection.toJson()},
    );
    return DiscoverMcpToolsResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<ImportMcpToolsResultDto> importMcpTools({
    required String serverName,
    String? serverDescription,
    required McpConnectionConfigDto connection,
    required List<String> toolNames,
    String conflictStrategy = 'skip',
  }) async {
    final response = await _dio.post(
      '/api/v1/mcp/import',
      data: {
        'serverName': serverName,
        if (serverDescription != null && serverDescription.trim().isNotEmpty)
          'serverDescription': serverDescription.trim(),
        'connection': connection.toJson(),
        'toolNames': toolNames,
        'conflictStrategy': conflictStrategy,
      },
    );
    return ImportMcpToolsResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<DiscoverMcpToolsResultDto> rediscoverMcpTools(String configId) async {
    final response = await _dio.post(
      '/api/v1/mcp/configs/$configId/rediscover',
    );
    return DiscoverMcpToolsResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<ImportMcpToolsResultDto> reimportMcpTools({
    required String configId,
    required List<String> toolNames,
    String conflictStrategy = 'skip',
  }) async {
    final response = await _dio.post(
      '/api/v1/mcp/configs/$configId/reimport',
      data: {'toolNames': toolNames, 'conflictStrategy': conflictStrategy},
    );
    return ImportMcpToolsResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<McpToolDefinitionDto> deactivateMcpTool(
    String toolDefinitionId,
  ) async {
    final response = await _dio.post(
      '/api/v1/mcp/tools/$toolDefinitionId/deactivate',
    );
    return McpToolDefinitionDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<McpServerConfigSummaryDto> updateMcpServerConfig(
    String configId, {
    String? name,
    String? description,
    String? status,
    McpConnectionConfigDto? connection,
  }) async {
    final payload = <String, dynamic>{};
    if (name != null) {
      payload['name'] = name.trim();
    }
    if (description != null) {
      payload['description'] = description.trim().isEmpty
          ? null
          : description.trim();
    }
    if (status != null) {
      payload['status'] = status;
    }
    if (connection != null) {
      payload['connection'] = connection.toJson();
    }

    final response = await _dio.patch(
      '/api/v1/mcp/configs/$configId',
      data: payload,
    );
    return McpServerConfigSummaryDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> deleteMcpServerConfig(String configId) async {
    await _dio.delete('/api/v1/mcp/configs/$configId');
  }

  Future<void> convertMcpServerConfigSourceToManual(String configId) async {
    await _dio.post(
      '/api/v1/resource-sources/mcp_server_config/$configId/convert-to-manual',
      data: _emptyJsonBody,
    );
  }

  Future<List<ApiKeyInfoDto>> listApiKeys() async {
    final response = await _dio.get('/api/v1/api-keys');
    return _unwrapListEnvelope(
      response,
    ).map(ApiKeyInfoDto.fromJson).toList(growable: false);
  }

  Future<List<LlmModelInfoDto>> listLlmModels() async {
    final response = await _dio.get('/api/v1/llm-models');
    return _unwrapListEnvelope(
      response,
    ).map(LlmModelInfoDto.fromJson).toList(growable: false);
  }

  Future<List<LlmModelConfigDto>> listLlmModelConfigs() async {
    final response = await _dio.get('/api/v1/llm-models');
    return _unwrapListEnvelope(
      response,
    ).map(LlmModelConfigDto.fromJson).toList(growable: false);
  }

  Future<LlmModelConfigDto> getLlmModelConfig(String modelId) async {
    final response = await _dio.get('/api/v1/llm-models/$modelId');
    return LlmModelConfigDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<LlmModelInfoDto> getLlmModel(String modelId) async {
    final response = await _dio.get('/api/v1/llm-models/$modelId');
    return LlmModelInfoDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<List<LlmProviderInfoDto>> listLlmProviders() async {
    final response = await _dio.get('/api/v1/llm-providers');
    return _unwrapListEnvelope(
      response,
    ).map(LlmProviderInfoDto.fromJson).toList(growable: false);
  }

  // -----------------------------------------------------------------------
  // Provider CRUD (两级架构 API)
  // -----------------------------------------------------------------------

  Future<List<LlmProviderEntityDto>> listLlmProviderEntities() async {
    final response = await _dio.get('/api/v1/llm-providers');
    return _unwrapListEnvelope(
      response,
    ).map(LlmProviderEntityDto.fromJson).toList(growable: false);
  }

  Future<LlmProviderEntityDto> getLlmProviderEntity(String id) async {
    final response = await _dio.get('/api/v1/llm-providers/$id');
    return LlmProviderEntityDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<LlmProviderEntityDto> createLlmProvider({
    required String name,
    required String baseUrl,
    String? slug,
    String apiProtocol = 'openai_chat',
    String? apiKey,
    String? apiKeyId,
    String? iconUrl,
    int? sortOrder,
    bool? isEnabled,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm-providers',
      data: {
        'name': name.trim(),
        'baseUrl': baseUrl.trim(),
        if (slug != null && slug.trim().isNotEmpty) 'slug': slug.trim(),
        'apiProtocol': apiProtocol,
        if (apiKey != null && apiKey.trim().isNotEmpty) 'apiKey': apiKey.trim(),
        if (apiKeyId != null && apiKeyId.isNotEmpty) 'apiKeyId': apiKeyId,
        if (iconUrl != null && iconUrl.trim().isNotEmpty)
          'iconUrl': iconUrl.trim(),
        if (sortOrder != null) 'sortOrder': sortOrder,
        if (isEnabled != null) 'isEnabled': isEnabled,
      },
    );
    return LlmProviderEntityDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<LlmProviderEntityDto> updateLlmProvider(
    String id, {
    String? name,
    String? baseUrl,
    bool clearBaseUrl = false,
    String? apiProtocol,
    String? apiKey,
    bool clearApiKey = false,
    String? apiKeyId,
    bool clearApiKeyId = false,
    String? iconUrl,
    int? sortOrder,
    bool? isEnabled,
  }) async {
    final payload = <String, dynamic>{};
    if (name != null) {
      payload['name'] = name.trim();
    }
    if (clearBaseUrl) {
      payload['baseUrl'] = null;
    } else if (baseUrl != null) {
      payload['baseUrl'] = baseUrl.trim().isEmpty ? null : baseUrl.trim();
    }
    if (apiProtocol != null) {
      payload['apiProtocol'] = apiProtocol;
    }
    if (clearApiKey) {
      payload['clearApiKey'] = true;
    } else if (apiKey != null && apiKey.trim().isNotEmpty) {
      payload['apiKey'] = apiKey.trim();
    } else if (clearApiKeyId) {
      payload['apiKeyId'] = null;
    } else if (apiKeyId != null) {
      payload['apiKeyId'] = apiKeyId;
    }
    if (iconUrl != null) {
      payload['iconUrl'] = iconUrl.trim().isEmpty ? null : iconUrl.trim();
    }
    if (sortOrder != null) {
      payload['sortOrder'] = sortOrder;
    }
    if (isEnabled != null) {
      payload['isEnabled'] = isEnabled;
    }
    final response = await _dio.patch(
      '/api/v1/llm-providers/$id',
      data: payload,
    );
    return LlmProviderEntityDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> deleteLlmProvider(String id) async {
    await _dio.delete('/api/v1/llm-providers/$id');
  }

  Future<LlmProviderEntityDto> resetLlmProviderBaseUrl(String id) async {
    final response = await _dio.post(
      '/api/v1/llm-providers/$id/reset-base-url',
    );
    return LlmProviderEntityDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<TestLlmConnectionResultDto> testLlmProviderConnection(
    String id, {
    int? timeoutMs,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm-providers/$id/test-connection',
      data: {if (timeoutMs != null) 'timeoutMs': timeoutMs},
    );
    return TestLlmConnectionResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<List<PrivateCloudModelInfoDto>> discoverLlmProviderModels(
    String id,
  ) async {
    final response = await _dio.post(
      '/api/v1/llm-providers/$id/discover-models',
    );
    return _unwrapListEnvelope(
      response,
    ).map(PrivateCloudModelInfoDto.fromJson).toList(growable: false);
  }

  Future<List<LiteLLMModelInfoDto>> searchLlmProviderLiteLLMModels(
    String id,
  ) async {
    final response = await _dio.get('/api/v1/llm-providers/$id/litellm-models');
    return _unwrapListEnvelope(
      response,
    ).map(LiteLLMModelInfoDto.fromJson).toList(growable: false);
  }

  Future<LiteLLMModelInfoDto?> lookupModelMetadata(
    String providerSlug,
    String modelId,
  ) async {
    final response = await _dio.get(
      '/api/v1/llm-providers/metadata/lookup',
      queryParameters: {'providerSlug': providerSlug, 'modelId': modelId},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'];
    if (data == null) {
      return null;
    }
    if (data is Map<String, dynamic>) {
      return LiteLLMModelInfoDto.fromJson(data);
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Model Config CRUD (新版, 使用 providerId + modelId)
  // -----------------------------------------------------------------------

  Future<LlmModelConfigDto> createLlmModelConfig({
    required String name,
    required String providerId,
    required String modelId,
    String modelType = 'chat',
    bool isDefault = false,
    bool isEnabled = true,
    ModelCapabilitiesDto? capabilities,
    int? contextWindow,
    int? maxOutputTokens,
    ModelPricingDto? pricing,
    Map<String, dynamic>? parameters,
    int? embeddingDimensions,
    int? timeoutMs,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm-models',
      data: {
        'name': name.trim(),
        'providerId': providerId,
        'modelId': modelId.trim(),
        'modelType': modelType,
        'isDefault': isDefault,
        'isEnabled': isEnabled,
        if (capabilities != null) 'capabilities': capabilities.toJson(),
        if (contextWindow != null) 'contextWindow': contextWindow,
        if (maxOutputTokens != null) 'maxOutputTokens': maxOutputTokens,
        if (pricing != null) 'pricing': pricing.toJson(),
        if (parameters != null && parameters.isNotEmpty)
          'parameters': parameters,
        if (embeddingDimensions != null)
          'embeddingDimensions': embeddingDimensions,
        if (timeoutMs != null) 'timeoutMs': timeoutMs,
      },
    );
    return LlmModelConfigDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<LlmModelConfigDto> updateLlmModelConfig(
    String id, {
    String? name,
    String? providerId,
    String? modelId,
    String? modelType,
    bool? isDefault,
    bool? isEnabled,
    ModelCapabilitiesDto? capabilities,
    int? contextWindow,
    bool clearContextWindow = false,
    int? maxOutputTokens,
    bool clearMaxOutputTokens = false,
    ModelPricingDto? pricing,
    bool clearPricing = false,
    Map<String, dynamic>? parameters,
    int? embeddingDimensions,
    bool clearEmbeddingDimensions = false,
    int? timeoutMs,
    bool clearTimeoutMs = false,
  }) async {
    final payload = <String, dynamic>{};
    if (name != null) {
      payload['name'] = name.trim();
    }
    if (providerId != null) {
      payload['providerId'] = providerId;
    }
    if (modelId != null) {
      payload['modelId'] = modelId.trim();
    }
    if (modelType != null) {
      payload['modelType'] = modelType;
    }
    if (isDefault != null) {
      payload['isDefault'] = isDefault;
    }
    if (isEnabled != null) {
      payload['isEnabled'] = isEnabled;
    }
    if (capabilities != null) {
      payload['capabilities'] = capabilities.toJson();
    }
    if (clearContextWindow) {
      payload['contextWindow'] = null;
    } else if (contextWindow != null) {
      payload['contextWindow'] = contextWindow;
    }
    if (clearMaxOutputTokens) {
      payload['maxOutputTokens'] = null;
    } else if (maxOutputTokens != null) {
      payload['maxOutputTokens'] = maxOutputTokens;
    }
    if (clearPricing) {
      payload['pricing'] = null;
    } else if (pricing != null) {
      payload['pricing'] = pricing.toJson();
    }
    if (parameters != null) {
      payload['parameters'] = parameters;
    }
    if (clearEmbeddingDimensions) {
      payload['embeddingDimensions'] = null;
    } else if (embeddingDimensions != null) {
      payload['embeddingDimensions'] = embeddingDimensions;
    }
    if (clearTimeoutMs) {
      payload['timeoutMs'] = null;
    } else if (timeoutMs != null) {
      payload['timeoutMs'] = timeoutMs;
    }

    final response = await _dio.patch('/api/v1/llm-models/$id', data: payload);
    return LlmModelConfigDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> deleteLlmModelConfig(String id) async {
    await _dio.delete('/api/v1/llm-models/$id');
  }

  Future<LlmModelInfoDto> createLlmModel({
    required String name,
    required String provider,
    required String modelType,
    required String modelName,
    required LlmParametersDto parameters,
    String? apiKeyId,
    int? embeddingDimensions,
    bool isDefault = false,
    String? endpointUrl,
    String? authMethod,
    Map<String, dynamic>? authConfig,
    int? timeoutMs,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm-models',
      data: {
        'name': name.trim(),
        'provider': provider,
        'modelType': modelType,
        'modelName': modelName.trim(),
        'parameters': parameters.toJson(),
        if (apiKeyId != null && apiKeyId.isNotEmpty) 'apiKeyId': apiKeyId,
        if (embeddingDimensions != null)
          'embeddingDimensions': embeddingDimensions,
        'isDefault': isDefault,
        if (endpointUrl != null && endpointUrl.trim().isNotEmpty)
          'endpointUrl': endpointUrl.trim(),
        if (authMethod != null && authMethod.isNotEmpty)
          'authMethod': authMethod,
        if (authConfig != null && authConfig.isNotEmpty)
          'authConfig': authConfig,
        if (timeoutMs != null) 'timeoutMs': timeoutMs,
      },
    );
    return LlmModelInfoDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<LlmModelInfoDto> updateLlmModel(
    String modelId, {
    String? name,
    String? provider,
    String? modelType,
    String? modelName,
    LlmParametersDto? parameters,
    String? apiKeyId,
    bool clearApiKey = false,
    int? embeddingDimensions,
    bool clearEmbeddingDimensions = false,
    bool? isDefault,
    String? endpointUrl,
    bool clearEndpointUrl = false,
    String? authMethod,
    bool clearAuthMethod = false,
    Map<String, dynamic>? authConfig,
    bool clearAuthConfig = false,
    int? timeoutMs,
    bool clearTimeoutMs = false,
  }) async {
    final payload = <String, dynamic>{};
    if (name != null) {
      payload['name'] = name.trim();
    }
    if (provider != null) {
      payload['provider'] = provider;
    }
    if (modelType != null) {
      payload['modelType'] = modelType;
    }
    if (modelName != null) {
      payload['modelName'] = modelName.trim();
    }
    if (parameters != null) {
      payload['parameters'] = parameters.toJson();
    }
    if (clearApiKey) {
      payload['apiKeyId'] = null;
    } else if (apiKeyId != null) {
      payload['apiKeyId'] = apiKeyId;
    }
    if (clearEmbeddingDimensions) {
      payload['embeddingDimensions'] = null;
    } else if (embeddingDimensions != null) {
      payload['embeddingDimensions'] = embeddingDimensions;
    }
    if (isDefault != null) {
      payload['isDefault'] = isDefault;
    }
    if (clearEndpointUrl) {
      payload['endpointUrl'] = null;
    } else if (endpointUrl != null) {
      payload['endpointUrl'] = endpointUrl.trim().isEmpty
          ? null
          : endpointUrl.trim();
    }
    if (clearAuthMethod) {
      payload['authMethod'] = null;
    } else if (authMethod != null) {
      payload['authMethod'] = authMethod;
    }
    if (clearAuthConfig) {
      payload['authConfig'] = null;
    } else if (authConfig != null) {
      payload['authConfig'] = authConfig;
    }
    if (clearTimeoutMs) {
      payload['timeoutMs'] = null;
    } else if (timeoutMs != null) {
      payload['timeoutMs'] = timeoutMs;
    }

    final response = await _dio.patch(
      '/api/v1/llm-models/$modelId',
      data: payload,
    );
    return LlmModelInfoDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<void> deleteLlmModel(String modelId) async {
    await _dio.delete('/api/v1/llm-models/$modelId');
  }

  Future<TestLlmConnectionResultDto> testPrivateCloudConnection({
    required String endpointUrl,
    required String authMethod,
    String? apiKey,
    String? apiKeyId,
    int? timeoutMs,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm/test-connection',
      data: {
        'endpointUrl': endpointUrl.trim(),
        'authMethod': authMethod,
        if (apiKey != null && apiKey.trim().isNotEmpty) 'apiKey': apiKey.trim(),
        if (apiKeyId != null && apiKeyId.isNotEmpty) 'apiKeyId': apiKeyId,
        if (timeoutMs != null) 'timeoutMs': timeoutMs,
      },
    );
    return TestLlmConnectionResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<List<PrivateCloudModelInfoDto>> fetchPrivateCloudModels({
    required String endpointUrl,
    required String authMethod,
    String? apiKey,
    String? apiKeyId,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm/private-cloud/models',
      data: {
        'endpointUrl': endpointUrl.trim(),
        'authMethod': authMethod,
        if (apiKey != null && apiKey.trim().isNotEmpty) 'apiKey': apiKey.trim(),
        if (apiKeyId != null && apiKeyId.isNotEmpty) 'apiKeyId': apiKeyId,
      },
    );
    return _unwrapListEnvelope(
      response,
    ).map(PrivateCloudModelInfoDto.fromJson).toList(growable: false);
  }
}

final resourcesApiProvider = Provider<ResourcesApi>((ref) {
  return ResourcesApi(ref.watch(apiClientProvider));
});
