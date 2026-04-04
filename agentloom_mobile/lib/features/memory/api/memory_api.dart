import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/providers/api_client_provider.dart';
import '../models/memory_audit_entry.dart';
import '../models/memory_instance.dart';
import '../models/memory_node.dart';
import '../models/memory_version.dart';

/// Memory API 客户端（只读）
class MemoryApi {
  final Dio _dio;

  MemoryApi(this._dio);

  /// 获取 Memory 实例列表
  Future<List<MemoryInstanceDto>> getMemoryInstances({
    int page = 1,
    int pageSize = 20,
    String? sourceKind,
  }) async {
    final response = await _dio.get(
      '/api/v1/memory-instances',
      queryParameters: {
        'page': page,
        'page_size': pageSize,
        if (sourceKind != null && sourceKind.isNotEmpty)
          'sourceKind': sourceKind,
      },
    );
    final data = response.data;
    // 支持直接列表或分页包装
    if (data is List) {
      return data
          .map(
            (json) => MemoryInstanceDto.fromJson(json as Map<String, dynamic>),
          )
          .toList();
    }
    final mapData = data as Map<String, dynamic>;
    final items = mapData['data'] as List? ?? [];
    return items
        .map((json) => MemoryInstanceDto.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// 获取单个 Memory 实例详情
  Future<MemoryInstanceDto> getMemoryInstance(String id) async {
    final response = await _dio.get('/api/v1/memory-instances/$id');
    final raw = response.data as Map<String, dynamic>;
    // 服务端返回 { data: { ...instance, stats: { nodeCount, edgeCount } } }
    final data = raw.containsKey('data')
        ? raw['data'] as Map<String, dynamic>
        : raw;
    // 将嵌套的 stats 平铺到顶层以匹配 DTO 字段
    if (data.containsKey('stats') && data['stats'] is Map) {
      final stats = data['stats'] as Map<String, dynamic>;
      data['nodeCount'] = stats['nodeCount'] ?? data['nodeCount'] ?? 0;
      data['edgeCount'] = stats['edgeCount'] ?? data['edgeCount'] ?? 0;
    }
    return MemoryInstanceDto.fromJson(data);
  }

  Future<void> convertSourceToManual(String id) async {
    await _dio.post(
      '/api/v1/resource-sources/memory_instance/$id/convert-to-manual',
      data: const <String, dynamic>{},
    );
  }

  /// 获取 Memory 实例的节点列表
  Future<List<MemoryNodeDto>> getMemoryNodes(String instanceId) async {
    final response = await _dio.get(
      '/api/v1/memory-instances/$instanceId/nodes',
    );
    final data = response.data;
    if (data is List) {
      return data
          .map((json) => MemoryNodeDto.fromJson(json as Map<String, dynamic>))
          .toList();
    }
    final mapData = data as Map<String, dynamic>;
    final items = mapData['data'] as List? ?? [];
    return items
        .map((json) => MemoryNodeDto.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// 获取单个节点详情
  Future<MemoryNodeDto> getMemoryNode(String instanceId, String nodeId) async {
    final response = await _dio.get(
      '/api/v1/memory-instances/$instanceId/nodes/$nodeId',
    );
    final raw = response.data as Map<String, dynamic>;
    // 服务端返回 { data: { ...node, versions, edges } }
    final data = raw.containsKey('data')
        ? raw['data'] as Map<String, dynamic>
        : raw;
    return MemoryNodeDto.fromJson(data);
  }

  /// 获取 Memory 实例审计日志（分页）
  Future<({List<MemoryAuditEntryDto> data, int total, int totalPages})>
  getAuditLog(String instanceId, {int page = 1, int pageSize = 20}) async {
    final response = await _dio.get(
      '/api/v1/memory-instances/$instanceId/audit',
      queryParameters: {'page': page, 'page_size': pageSize},
    );
    final data = response.data;
    if (data is List) {
      final entries = data
          .map(
            (json) =>
                MemoryAuditEntryDto.fromJson(json as Map<String, dynamic>),
          )
          .toList();
      return (data: entries, total: entries.length, totalPages: 1);
    }
    final mapData = data as Map<String, dynamic>;
    final items = mapData['data'] as List? ?? [];
    final meta = mapData['meta'] as Map<String, dynamic>? ?? {};
    final entries = items
        .map(
          (json) => MemoryAuditEntryDto.fromJson(json as Map<String, dynamic>),
        )
        .toList();
    return (
      data: entries,
      total: (meta['total'] as int?) ?? entries.length,
      totalPages: (meta['totalPages'] as int?) ?? 1,
    );
  }

  /// 获取节点版本详情（服务端无单版本端点，通过列表过滤）
  Future<MemoryVersionDto> getVersionDetail(
    String instanceId,
    String nodeId,
    String versionId,
  ) async {
    final versions = await getMemoryVersions(instanceId, nodeId);
    return versions.firstWhere(
      (v) => v.id == versionId,
      orElse: () => throw DioException(
        requestOptions: RequestOptions(path: ''),
        message: 'Version $versionId not found',
        type: DioExceptionType.badResponse,
      ),
    );
  }

  /// 获取节点版本历史
  Future<List<MemoryVersionDto>> getMemoryVersions(
    String instanceId,
    String nodeId,
  ) async {
    final response = await _dio.get(
      '/api/v1/memory-instances/$instanceId/nodes/$nodeId/versions',
    );
    final data = response.data;
    if (data is List) {
      return data
          .map(
            (json) => MemoryVersionDto.fromJson(json as Map<String, dynamic>),
          )
          .toList();
    }
    final mapData = data as Map<String, dynamic>;
    final items = mapData['data'] as List? ?? [];
    return items
        .map((json) => MemoryVersionDto.fromJson(json as Map<String, dynamic>))
        .toList();
  }
}

/// Memory API Provider
final memoryApiProvider = Provider<MemoryApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return MemoryApi(dio);
});
