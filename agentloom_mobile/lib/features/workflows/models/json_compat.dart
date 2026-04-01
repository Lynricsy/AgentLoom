Map<String, dynamic>? asStringKeyedMap(Object? value) {
  if (value is! Map) {
    return null;
  }

  return value.map((key, entryValue) {
    return MapEntry(key.toString(), entryValue);
  });
}

Map<String, dynamic> normalizeJsonAliases(
  Map<String, dynamic> json, {
  required Map<String, List<String>> aliases,
  Map<String, Object? Function(Object? value)> transforms = const {},
}) {
  final normalized = Map<String, dynamic>.from(json);

  for (final entry in aliases.entries) {
    if (normalized.containsKey(entry.key)) {
      continue;
    }

    for (final alias in entry.value) {
      if (!json.containsKey(alias)) {
        continue;
      }

      final value = json[alias];
      final transform = transforms[entry.key];
      normalized[entry.key] = transform != null ? transform(value) : value;
      break;
    }
  }

  return normalized;
}

List<Map<String, dynamic>>? normalizeJsonMapList(
  Object? value,
  Map<String, dynamic> Function(Map<String, dynamic> json) normalizer,
) {
  if (value is! List) {
    return null;
  }

  final normalized = <Map<String, dynamic>>[];
  for (final item in value) {
    final map = asStringKeyedMap(item);
    if (map == null) {
      continue;
    }
    normalized.add(normalizer(map));
  }

  return normalized;
}
