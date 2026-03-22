import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/providers/api_client_provider.dart';
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
  }) async {
    final response = await _dio.get(
      '/api/v1/memory-instances',
      queryParameters: {'page': page, 'page_size': pageSize},
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
    final data = response.data as Map<String, dynamic>;
    return MemoryInstanceDto.fromJson(data);
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
    final data = response.data as Map<String, dynamic>;
    return MemoryNodeDto.fromJson(data);
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
