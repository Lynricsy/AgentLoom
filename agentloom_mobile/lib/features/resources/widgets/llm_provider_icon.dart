import 'package:flutter/material.dart';

class LlmProviderIcon extends StatelessWidget {
  const LlmProviderIcon({
    super.key,
    required this.slug,
    this.iconUrl,
    this.size = 24,
  });

  final String slug;
  final String? iconUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Image.network(
      iconUrl ?? 'https://icons.lobehub.com/icons/$slug/color.svg',
      width: size,
      height: size,
      errorBuilder: (_, __, ___) => Icon(_fallbackIcon(slug), size: size),
    );
  }

  static IconData _fallbackIcon(String slug) {
    switch (slug) {
      case 'openai':
        return Icons.auto_awesome_rounded;
      case 'anthropic':
        return Icons.psychology_alt_rounded;
      case 'google':
        return Icons.token_rounded;
      case 'deepseek':
        return Icons.explore_rounded;
      default:
        return Icons.hub_rounded;
    }
  }
}
