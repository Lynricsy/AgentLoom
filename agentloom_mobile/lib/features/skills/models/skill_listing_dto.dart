import 'package:freezed_annotation/freezed_annotation.dart';

part 'skill_listing_dto.freezed.dart';
part 'skill_listing_dto.g.dart';

/// 插件信息（嵌套在 Skill 列表项中）
@freezed
abstract class SkillPluginInfo with _$SkillPluginInfo {
  const factory SkillPluginInfo({
    @JsonKey(name: 'plugin_id') String? pluginId,
    String? name,
    String? version,
    String? author,
    String? description,
    String? license,
  }) = _SkillPluginInfo;

  factory SkillPluginInfo.fromJson(Map<String, dynamic> json) =>
      _$SkillPluginInfoFromJson(json);
}

/// 作者信息
@freezed
abstract class SkillAuthorInfo with _$SkillAuthorInfo {
  const factory SkillAuthorInfo({
    @JsonKey(name: 'display_name') String? displayName,
  }) = _SkillAuthorInfo;

  factory SkillAuthorInfo.fromJson(Map<String, dynamic> json) =>
      _$SkillAuthorInfoFromJson(json);
}

/// Skill 列表项 DTO（对应 marketplace browse 响应）
@freezed
abstract class SkillListingDto with _$SkillListingDto {
  const factory SkillListingDto({
    required String id,
    required String title,
    String? summary,
    @Default([]) List<String> tags,
    @JsonKey(name: 'cover_image_url') String? coverImageUrl,
    String? category,
    @JsonKey(name: 'use_count') @Default(0) int useCount,
    @JsonKey(name: 'avg_rating') String? avgRating,
    @JsonKey(name: 'review_count') @Default(0) int reviewCount,
    @JsonKey(name: 'published_at') String? publishedAt,
    @JsonKey(name: 'listing_type') String? listingType,
    @JsonKey(name: 'pricing_model') String? pricingModel,
    @JsonKey(name: 'price_per_execution') double? pricePerExecution,
    SkillPluginInfo? plugin,
    SkillAuthorInfo? author,
  }) = _SkillListingDto;

  factory SkillListingDto.fromJson(Map<String, dynamic> json) =>
      _$SkillListingDtoFromJson(json);
}

/// Skill 列表分页状态（非 Freezed，手写 copyWith）
class SkillListState {
  final List<SkillListingDto> skills;
  final int currentPage;
  final bool hasMore;
  final String? categoryFilter;
  final String? searchQuery;
  final String sortBy;
  final bool isLoadingMore;

  const SkillListState({
    this.skills = const [],
    this.currentPage = 1,
    this.hasMore = true,
    this.categoryFilter,
    this.searchQuery,
    this.sortBy = 'popular',
    this.isLoadingMore = false,
  });

  SkillListState copyWith({
    List<SkillListingDto>? skills,
    int? currentPage,
    bool? hasMore,
    String? categoryFilter,
    String? searchQuery,
    String? sortBy,
    bool? isLoadingMore,
  }) {
    return SkillListState(
      skills: skills ?? this.skills,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      categoryFilter: categoryFilter ?? this.categoryFilter,
      searchQuery: searchQuery ?? this.searchQuery,
      sortBy: sortBy ?? this.sortBy,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    );
  }
}
