import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/resource_entities.dart';

Map<String, dynamic> _unwrapDataEnvelope(Response<dynamic> response) {
  final body = response.data as Map<String, dynamic>;
  final data = body['data'];
  if (data is Map<String, dynamic>) {
    return data;
  }
  if (data is Map<Object?, Object?>) {
    return data.map((key, value) => MapEntry('$key', value));
  }
  return body;
}

List<Map<String, dynamic>> _unwrapListEnvelope(Response<dynamic> response) {
  final body = response.data;
  final data = body is Map<String, dynamic> ? body['data'] : body;
  if (data is! List) {
    return const <Map<String, dynamic>>[];
  }

  return data
      .map((item) {
        if (item is Map<String, dynamic>) {
          return item;
        }
        if (item is Map<Object?, Object?>) {
          return item.map((key, value) => MapEntry('$key', value));
        }
        return <String, dynamic>{};
      })
      .toList(growable: false);
}

class ResourcesApi {
  ResourcesApi(this._dio);

  final Dio _dio;

  Future<PaginatedResponse<WorkspaceDto>> listWorkspaces({
    int page = 1,
    int pageSize = 20,
    String? search,
  }) async {
    final response = await _dio.get(
      '/api/v1/workspaces',
      queryParameters: {
        'page': page,
        'page_size': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      },
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => WorkspaceDto.fromJson(json! as Map<String, dynamic>),
    );
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

  Future<PaginatedResponse<SandboxSessionDto>> listSandboxes({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    String? lifecycleMode,
  }) async {
    final response = await _dio.get(
      '/api/v1/sandboxes',
      queryParameters: {
        'page': page,
        'page_size': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
        if (lifecycleMode != null && lifecycleMode.isNotEmpty)
          'lifecycle_mode': lifecycleMode,
      },
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => SandboxSessionDto.fromJson(json! as Map<String, dynamic>),
    );
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
    await _dio.post('/api/v1/sandboxes/$sessionId/start');
  }

  Future<void> stopSandbox(String sessionId) async {
    await _dio.post('/api/v1/sandboxes/$sessionId/stop');
  }

  Future<void> deleteSandbox(String sessionId) async {
    await _dio.delete('/api/v1/sandboxes/$sessionId');
  }

  Future<PaginatedResponse<KnowledgeBaseDto>> listKnowledgeBases({
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _dio.get(
      '/api/v1/knowledge-bases',
      queryParameters: {'page': page, 'page_size': pageSize},
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => KnowledgeBaseDto.fromJson(json! as Map<String, dynamic>),
    );
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
        'page_size': pageSize,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => KnowledgeDocumentDto.fromJson(json! as Map<String, dynamic>),
    );
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

  Future<PaginatedResponse<McpServerConfigSummaryDto>> listMcpServerConfigs({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    String? transportType,
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
      },
    );
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) =>
          McpServerConfigSummaryDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  Future<McpServerConfigDetailDto> getMcpServerConfig(String configId) async {
    final response = await _dio.get('/api/v1/mcp/configs/$configId');
    return McpServerConfigDetailDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<TestMcpConnectionResultDto> testSavedMcpConfigConnection(
    String configId,
  ) async {
    final response = await _dio.post('/api/v1/mcp/configs/$configId/test');
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
    String? apiKeyId,
    int? timeoutMs,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm/test-connection',
      data: {
        'endpointUrl': endpointUrl.trim(),
        'authMethod': authMethod,
        if (apiKeyId != null && apiKeyId.isNotEmpty) 'apiKeyId': apiKeyId,
        if (timeoutMs != null) 'timeoutMs': timeoutMs,
      },
    );
    return TestLlmConnectionResultDto.fromJson(_unwrapDataEnvelope(response));
  }

  Future<List<PrivateCloudModelInfoDto>> fetchPrivateCloudModels({
    required String endpointUrl,
    required String authMethod,
    String? apiKeyId,
  }) async {
    final response = await _dio.post(
      '/api/v1/llm/private-cloud/models',
      data: {
        'endpointUrl': endpointUrl.trim(),
        'authMethod': authMethod,
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
