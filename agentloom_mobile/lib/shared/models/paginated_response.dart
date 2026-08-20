import 'package:json_annotation/json_annotation.dart';
import '../utils/json_key_normalizer.dart';

part 'paginated_response.g.dart';

/// 分页元数据
@JsonSerializable()
class PaginationMeta {
  final int total;
  final int page;
  final int pageSize;
  final int totalPages;

  const PaginationMeta({
    required this.total,
    required this.page,
    required this.pageSize,
    required this.totalPages,
  });

  factory PaginationMeta.fromJson(Map<String, dynamic> json) =>
      _$PaginationMetaFromJson(normalizeJsonMap(json));

  Map<String, dynamic> toJson() => _$PaginationMetaToJson(this);
}

/// 通用分页响应
@JsonSerializable(genericArgumentFactories: true)
class PaginatedResponse<T> {
  final List<T> data;
  final PaginationMeta meta;

  const PaginatedResponse({required this.data, required this.meta});

  factory PaginatedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) => _$PaginatedResponseFromJson(normalizeJsonMap(json), fromJsonT);

  Map<String, dynamic> toJson(Object? Function(T value) toJsonT) =>
      _$PaginatedResponseToJson(this, toJsonT);
}
