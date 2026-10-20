import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../../../shared/providers/api_client_provider.dart';
import '../models/skill_dto.dart';

/// 技能 API 客户端 — 对应服务端 SkillController
class SkillApi {
  final Dio _dio;

  SkillApi(this._dio);

  /// 获取技能列表（分页 + 筛选）
  Future<PaginatedResponse<SkillDto>> listSkills({
    int page = 1,
    int pageSize = 20,
    String? status,
    bool? isBuiltin,
    String? search,
    String? sourceKind,
  }) async {
    final queryParams = <String, dynamic>{'page': page, 'pageSize': pageSize};
    if (status != null) queryParams['status'] = status;
    if (isBuiltin != null) queryParams['isBuiltin'] = isBuiltin;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (sourceKind != null && sourceKind.isNotEmpty) {
      queryParams['sourceKind'] = sourceKind;
    }

    final response = await _dio.get(
      '/api/v1/skills',
      queryParameters: queryParams,
    );

    return PaginatedResponse<SkillDto>.fromJson(
      response.data as Map<String, dynamic>,
      (json) => SkillDto.fromJson(json! as Map<String, dynamic>),
    );
  }

  /// 获取单个技能详情
  Future<SkillDto> getSkill(String id) async {
    final response = await _dio.get('/api/v1/skills/$id');
    final data = response.data as Map<String, dynamic>;
    return SkillDto.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// 创建技能
  ///
  /// 服务端只接受 multipart/form-data：元数据以 JSON 字符串放在 `metadata` 字段
  /// （JSON 请求体返回 415），description 为必填。
  Future<SkillDto> createSkill({
    required String name,
    required String description,
    String? content,
  }) async {
    final metadata = <String, dynamic>{
      'name': name,
      'description': description,
    };
    if (content != null) metadata['content'] = content;

    final response = await _dio.post(
      '/api/v1/skills',
      data: _metadataForm(metadata),
    );
    final data = response.data as Map<String, dynamic>;
    return SkillDto.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// 更新技能（含 OCC 版本），与创建一样以 multipart 的 `metadata` 字段提交
  Future<SkillDto> updateSkill(
    String id, {
    String? name,
    String? description,
    String? content,
    required int occVersion,
  }) async {
    final metadata = <String, dynamic>{'occVersion': occVersion};
    if (name != null) metadata['name'] = name;
    if (description != null) metadata['description'] = description;
    if (content != null) metadata['content'] = content;

    final response = await _dio.put(
      '/api/v1/skills/$id',
      data: _metadataForm(metadata),
    );
    final data = response.data as Map<String, dynamic>;
    return SkillDto.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// 组装 SkillController 要求的 multipart 表单：只含 JSON 编码的 `metadata` 字段
  FormData _metadataForm(Map<String, dynamic> metadata) =>
      FormData.fromMap({'metadata': jsonEncode(metadata)});

  /// 删除技能
  Future<void> deleteSkill(String id) async {
    await _dio.delete('/api/v1/skills/$id');
  }

  /// 归档技能
  Future<SkillDto> archiveSkill(String id) async {
    final response = await _dio.patch('/api/v1/skills/$id/archive');
    final data = response.data as Map<String, dynamic>;
    return SkillDto.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<void> convertSourceToManual(String id) async {
    await _dio.post(
      '/api/v1/resource-sources/skill/$id/convert-to-manual',
      data: const <String, dynamic>{},
    );
  }
}

/// 技能 API Provider
final skillApiProvider = Provider<SkillApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return SkillApi(dio);
});
