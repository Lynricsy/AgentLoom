// Emoji 提取与转换工具
//
// 从文本中提取首个 emoji 并转换为 hex codepoint 字符串，
// 供 EntityIcon 渲染 Fluent Emoji 3D CDN 图片。

/// 匹配字符串开头的 emoji（含 Emoji_Presentation 和带 VS16 的 Emoji）
final _leadingEmojiRe = RegExp(
  r'^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)',
  unicode: true,
);

/// 从 [title] 中提取首个 emoji 字符。
///
/// 返回 `null` 表示无 emoji。
String? extractLeadingEmoji(String? title) {
  if (title == null || title.isEmpty) return null;
  final match = _leadingEmojiRe.firstMatch(title);
  return match?.group(0);
}

/// 从 [title] 中去除开头的 emoji 并返回剩余文本。
String extractTextAfterEmoji(String? title, {String fallback = ''}) {
  if (title == null || title.isEmpty) return fallback;
  return title
          .replaceFirst(
            RegExp(r'^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*',
                unicode: true),
            '',
          )
          .trim()
          .ifEmpty(fallback) ??
      fallback;
}

/// 将 emoji 字符转换为 hex codepoint 字符串（如 `1f4ac`）。
///
/// 复合 emoji（如国旗 🇨🇳）输出 `1f1e8-1f1f3` 格式，
/// 与 [EntityIcon] 的 Fluent 3D CDN 路径一致。
String emojiToCodepoint(String emoji) {
  return emoji.runes.map((r) => r.toRadixString(16)).join('-');
}

extension _StringEmpty on String {
  String? ifEmpty(String fallback) => isEmpty ? fallback : this;
}
