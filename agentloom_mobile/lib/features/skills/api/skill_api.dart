import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/providers/api_client_provider.dart';
import '../models/skill_listing_dto.dart';
import '../models/skill_review_dto.dart';

/// Skill(Marketplace) API 客户端
class SkillApi {
  final Dio _dio;

  SkillApi(this._dio);

  /// 浏览 Skill 列表（公开接口，无需认证）
  Future<SkillBrowseResponse> browseSkills({
    int page = 1,
    int pageSize = 20,
    String? category,
    String? search,
    String sort = 'popular',
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'pageSize': pageSize,
      'sort': sort,
      'listingType': 'plugin',
    };
    if (category != null) queryParams['category'] = category;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;

    final response = await _dio.get(
      '/api/v1/marketplace/browse',
      queryParameters: queryParams,
    );
    final data = response.data as Map<String, dynamic>;
    return SkillBrowseResponse.fromJson(data);
  }

  /// 获取单个 Skill 详情（含评价）
  Future<SkillListingDto> getSkillDetail(String id) async {
    final response = await _dio.get('/api/v1/marketplace/browse/$id');
    final data = response.data as Map<String, dynamic>;
    return SkillListingDto.fromJson(data);
  }

  /// 获取 Skill 评价列表
  Future<List<SkillReviewDto>> getSkillReviews(
    String id, {
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _dio.get(
      '/api/v1/marketplace/browse/$id/reviews',
      queryParameters: {'page': page, 'pageSize': pageSize},
    );
    final data = response.data as Map<String, dynamic>;
    final reviewsList = data['data'] as List<dynamic>? ?? [];
    return reviewsList
        .map((json) => SkillReviewDto.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// 安装 Skill（需认证）
  Future<SkillInstallResponse> installSkill(String listingId) async {
    final response = await _dio.post(
      '/api/v1/marketplace/listings/$listingId/install',
    );
    final data = response.data as Map<String, dynamic>;
    return SkillInstallResponse.fromJson(data);
  }

  /// 提交评价（需认证）
  Future<void> submitReview(
    String listingId, {
    required int rating,
    String? content,
  }) async {
    final body = <String, dynamic>{'rating': rating};
    if (content != null && content.isNotEmpty) body['content'] = content;
    await _dio.post(
      '/api/v1/marketplace/listings/$listingId/reviews',
      data: body,
    );
  }
}

/// Marketplace browse 响应（自定义分页，服务端返回 camelCase）
class SkillBrowseResponse {
  final List<SkillListingDto> data;
  final int page;
  final int pageSize;
  final int total;
  final int totalPages;

  const SkillBrowseResponse({
    required this.data,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
  });

  factory SkillBrowseResponse.fromJson(Map<String, dynamic> json) {
    final dataList = json['data'] as List<dynamic>? ?? [];
    final meta = json['meta'] as Map<String, dynamic>? ?? {};
    return SkillBrowseResponse(
      data: dataList
          .map((item) => SkillListingDto.fromJson(item as Map<String, dynamic>))
          .toList(),
      page: meta['page'] as int? ?? 1,
      pageSize: meta['pageSize'] as int? ?? 20,
      total: meta['total'] as int? ?? 0,
      totalPages: meta['totalPages'] as int? ?? 1,
    );
  }
}

/// Skill API Provider
final skillApiProvider = Provider<SkillApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return SkillApi(dio);
});
