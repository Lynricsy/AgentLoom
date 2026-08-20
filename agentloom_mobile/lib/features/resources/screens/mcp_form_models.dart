class McpFormParseException implements Exception {
  const McpFormParseException(this.message);
  final String message;
  @override
  String toString() => message;
}

List<String> parseMcpLines(String raw) => raw
    .split('\n')
    .map((line) => line.trim())
    .where((line) => line.isNotEmpty)
    .toList(growable: false);

Map<String, String> parseMcpKeyValueLines(String raw) {
  final result = <String, String>{};
  final errors = <String>[];
  final lines = raw.split('\n');
  for (var index = 0; index < lines.length; index++) {
    final trimmed = lines[index].trim();
    if (trimmed.isEmpty) continue;
    final equalsIndex = trimmed.indexOf('=');
    final colonIndex = trimmed.indexOf(':');
    final separatorIndex = equalsIndex >= 0 ? equalsIndex : colonIndex;
    if (separatorIndex <= 0) {
      errors.add('第 ${index + 1} 行缺少 KEY=value 分隔符');
      continue;
    }
    final key = trimmed.substring(0, separatorIndex).trim();
    if (key.isEmpty) {
      errors.add('第 ${index + 1} 行的键不能为空');
      continue;
    }
    result[key] = trimmed.substring(separatorIndex + 1).trim();
  }
  if (errors.isNotEmpty) throw McpFormParseException(errors.join('\n'));
  return result;
}
