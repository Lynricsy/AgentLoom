import 'package:json_annotation/json_annotation.dart';

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

  factory PaginationMeta.fromJson(Map<String, dynamic> json) {
    return _$PaginationMetaFromJson({
      'total': json['total'] ?? 0,
      'page': json['page'] ?? 1,
      'pageSize': json['pageSize'] ?? json['page_size'] ?? 20,
      'totalPages': json['totalPages'] ?? json['total_pages'] ?? 0,
    });
  }

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
  ) => _$PaginatedResponseFromJson(json, fromJsonT);

  Map<String, dynamic> toJson(Object? Function(T value) toJsonT) =>
      _$PaginatedResponseToJson(this, toJsonT);
}
