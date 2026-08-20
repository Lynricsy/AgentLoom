import '../../../shared/utils/json_key_normalizer.dart';

/// 资源接口返回内容不符合移动端契约。
class ApiContractException implements Exception {
  const ApiContractException(this.message, {this.cause});

  final String message;
  final Object? cause;

  @override
  String toString() => 'ApiContractException: $message';
}

Map<String, dynamic> decodeResourceObject(Object? value, {required String path}) {
  final normalized = normalizeJsonKeys(value);
  if (normalized is! Map<String, dynamic>) {
    throw ApiContractException('$path 应为对象，实际为 ${value.runtimeType}');
  }
  return normalized;
}

List<Map<String, dynamic>> decodeResourceList(Object? body, {required String path}) {
  final normalized = normalizeJsonKeys(body);
  final value = normalized is Map<String, dynamic> && normalized.containsKey('data')
      ? normalized['data']
      : normalized;
  if (value is! List) {
    throw ApiContractException('$path.data 应为列表，实际为 ${value.runtimeType}');
  }
  return List<Map<String, dynamic>>.unmodifiable(
    value.asMap().entries.map((entry) {
      final item = entry.value;
      if (item is! Map<String, dynamic>) {
        throw ApiContractException('$path.data[${entry.key}] 应为对象，实际为 ${item.runtimeType}');
      }
      return item;
    }),
  );
}

T decodeResourceDto<T>(
  Map<String, dynamic> json,
  T Function(Map<String, dynamic>) decode, {
  required String name,
}) {
  try {
    return decode(normalizeJsonMap(json));
  } on ApiContractException {
    rethrow;
  } catch (error) {
    throw ApiContractException('$name 字段不符合契约', cause: error);
  }
}
