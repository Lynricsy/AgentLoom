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

  return data.map((item) {
    if (item is Map<String, dynamic>) {
      return item;
    }
    if (item is Map<Object?, Object?>) {
      return item.map((key, value) => MapEntry('$key', value));
    }
    return <String, dynamic>{};
  }).toList(growable: false);
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
      data: {
        'name': name,
        'cpu': cpu,
        'memory': memory,
        'disk': disk,
      },
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
}

final resourcesApiProvider = Provider<ResourcesApi>((ref) {
  return ResourcesApi(ref.watch(apiClientProvider));
});
