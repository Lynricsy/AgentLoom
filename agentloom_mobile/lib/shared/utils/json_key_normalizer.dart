/// 将 REST JSON 中的 snake_case 键递归转换为 camelCase。
///
/// Map 与 List 会递归处理；同一层同时存在 camelCase 与对应 snake_case 键时，
/// camelCase 值优先，避免兼容输入覆盖 canonical wire 字段。
Object? normalizeJsonKeys(Object? value) {
  if (value is List) {
    return value.map(normalizeJsonKeys).toList(growable: false);
  }

  if (value is! Map) {
    return value;
  }

  final normalized = <String, dynamic>{};

  // 先接收兼容的 snake_case 键，再由 canonical camelCase 键覆盖。
  for (final entry in value.entries) {
    final key = entry.key.toString();
    if (!key.contains('_')) {
      continue;
    }
    normalized[_snakeToCamel(key)] = normalizeJsonKeys(entry.value);
  }
  for (final entry in value.entries) {
    final key = entry.key.toString();
    if (key.contains('_')) {
      continue;
    }
    normalized[key] = normalizeJsonKeys(entry.value);
  }

  return normalized;
}

Map<String, dynamic> normalizeJsonMap(Map<Object?, Object?> json) {
  return normalizeJsonKeys(json)! as Map<String, dynamic>;
}

String _snakeToCamel(String key) {
  return key.replaceAllMapped(
    RegExp(r'_+([a-zA-Z0-9])'),
    (match) => match.group(1)!.toUpperCase(),
  );
}
