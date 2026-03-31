import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Fluent Emoji 3D CDN 基础 URL
const _fluentEmojiCdn =
    'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets';

/// Lucide 图标名 -> Material Icons 映射表
///
/// 覆盖 Studio 画布中最常用的 lucide 图标名称。
const _lucideToMaterial = <String, IconData>{
  'Sparkles': Icons.auto_awesome,
  'sparkles': Icons.auto_awesome,
  'Bot': Icons.smart_toy,
  'bot': Icons.smart_toy,
  'Workflow': Icons.account_tree,
  'workflow': Icons.account_tree,
  'Brain': Icons.psychology,
  'brain': Icons.psychology,
  'Code': Icons.code,
  'code': Icons.code,
  'Database': Icons.storage,
  'database': Icons.storage,
  'FileText': Icons.description,
  'file-text': Icons.description,
  'Globe': Icons.language,
  'globe': Icons.language,
  'Image': Icons.image,
  'image': Icons.image,
  'Mail': Icons.mail,
  'mail': Icons.mail,
  'MessageSquare': Icons.chat_bubble_outline,
  'message-square': Icons.chat_bubble_outline,
  'Search': Icons.search,
  'search': Icons.search,
  'Settings': Icons.settings,
  'settings': Icons.settings,
  'Shield': Icons.shield,
  'shield': Icons.shield,
  'Star': Icons.star,
  'star': Icons.star,
  'Terminal': Icons.terminal,
  'terminal': Icons.terminal,
  'Zap': Icons.bolt,
  'zap': Icons.bolt,
  'BookOpen': Icons.menu_book,
  'book-open': Icons.menu_book,
  'Layers': Icons.layers,
  'layers': Icons.layers,
  'Link': Icons.link,
  'link': Icons.link,
  'Rocket': Icons.rocket_launch,
  'rocket': Icons.rocket_launch,
  'Cpu': Icons.memory,
  'cpu': Icons.memory,
  'Cloud': Icons.cloud,
  'cloud': Icons.cloud,
  'Eye': Icons.visibility,
  'eye': Icons.visibility,
  'Lock': Icons.lock,
  'lock': Icons.lock,
  'Users': Icons.group,
  'users': Icons.group,
  'Folder': Icons.folder,
  'folder': Icons.folder,
  'Clock': Icons.access_time,
  'clock': Icons.access_time,
};

/// 将 Unicode codepoint hex 字符串转为原生 emoji 字符。
///
/// 支持组合 codepoint（如 "1f1e8-1f1f3"）。
String _codePointToNative(String codepoint) {
  return codepoint
      .split('-')
      .map((hex) => String.fromCharCode(int.parse(hex, radix: 16)))
      .join();
}

/// 通用实体图标组件
///
/// 根据 [icon] 值自动选择渲染方式：
/// - `null` → 渲染 [fallbackIcon]
/// - `lucide:xxx` → 映射到对应 Material Icon
/// - 其他 → 当作 emoji codepoint，显示 Fluent 3D CDN 图片
class EntityIcon extends StatelessWidget {
  const EntityIcon({
    super.key,
    required this.icon,
    required this.fallbackIcon,
    this.size = 20,
    this.color,
  });

  /// icon 值：null 显示 fallback，"lucide:xxx" 显示 Material Icon，
  /// 其他当作 emoji codepoint 显示 CDN 图片。
  final String? icon;

  /// 默认 fallback 图标
  final IconData fallbackIcon;

  /// 图标尺寸（px），默认 20
  final double size;

  /// 图标颜色（仅对 Icon 类型生效）
  final Color? color;

  @override
  Widget build(BuildContext context) {
    // 无 icon 值，渲染默认 fallback 图标
    if (icon == null || icon!.isEmpty) {
      return Icon(fallbackIcon, size: size, color: color);
    }

    final iconValue = icon!;

    // lucide 图标
    if (iconValue.startsWith('lucide:')) {
      final iconName = iconValue.substring(7);
      final materialIcon = _lucideToMaterial[iconName];
      if (materialIcon != null) {
        return Icon(materialIcon, size: size, color: color);
      }
      // lucide 图标名无效，fallback
      return Icon(fallbackIcon, size: size, color: color);
    }

    // emoji codepoint，渲染 Fluent 3D CDN 图片
    return _EmojiImage(
      codepoint: iconValue,
      size: size,
      fallbackIcon: fallbackIcon,
      color: color,
    );
  }
}

/// Emoji 图片子组件
///
/// CDN 加载失败时 fallback 到原生 emoji 字符，再失败则使用 fallback 图标。
class _EmojiImage extends StatelessWidget {
  const _EmojiImage({
    required this.codepoint,
    required this.size,
    required this.fallbackIcon,
    this.color,
  });

  final String codepoint;
  final double size;
  final IconData fallbackIcon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return CachedNetworkImage(
      imageUrl: '$_fluentEmojiCdn/$codepoint.webp',
      width: size,
      height: size,
      fit: BoxFit.contain,
      placeholder: (_, __) => SizedBox(width: size, height: size),
      errorWidget: (_, __, ___) {
        // CDN 加载失败，尝试渲染原生 emoji
        final native = _codePointToNative(codepoint);
        if (native.isNotEmpty) {
          return SizedBox(
            width: size,
            height: size,
            child: FittedBox(
              child: Text(
                native,
                style: TextStyle(fontSize: size),
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        // emoji 也无效，使用 fallback 图标
        return Icon(fallbackIcon, size: size, color: color);
      },
    );
  }
}
