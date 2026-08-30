import 'package:flutter/material.dart';

const _lobeStaticPngBase = 'https://unpkg.com/@lobehub/icons-static-png@latest';
const _lobeStaticSvgBase =
    'https://unpkg.com/@lobehub/icons-static-svg@latest/icons';
const _legacyLobeIconBase = 'https://icons.lobehub.com/icons/';
const _noIconSlugs = {'custom', 'private_cloud'};
const _lobeIconAssetAliases = {
  'anthropic': 'claude-color',
  'google': 'gemini-color',
  'deepseek': 'deepseek-color',
  'mistral': 'mistral-color',
  'cohere': 'cohere-color',
  'xai': 'grok',
  'together': 'together-color',
  'fireworks': 'fireworks-color',
  'perplexity': 'perplexity-color',
  'siliconflow': 'siliconcloud-color',
  'zhipu': 'zhipu-color',
  'moonshot': 'kimi-color',
  'qwen': 'qwen-color',
  'doubao': 'doubao-color',
  'minimax': 'minimax-color',
  'baichuan': 'baichuan-color',
  'yi': 'yi-color',
  'stepfun': 'stepfun-color',
  'hunyuan': 'hunyuan-color',
};

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
    final src = _resolveIconUrl(Theme.of(context).brightness);
    if (src == null) {
      return Icon(_fallbackIcon(slug), size: size);
    }

    return Image.network(
      src,
      width: size,
      height: size,
      errorBuilder: (_, _, _) => Icon(_fallbackIcon(slug), size: size),
    );
  }

  String? _resolveIconUrl(Brightness brightness) {
    final current = iconUrl;
    final isManagedLobeUrl =
        current != null &&
        (current.startsWith(_legacyLobeIconBase) ||
            current.startsWith(_lobeStaticSvgBase) ||
            current.startsWith('$_lobeStaticPngBase/'));
    if (current != null && !isManagedLobeUrl) {
      return current;
    }

    if (_noIconSlugs.contains(slug)) {
      return null;
    }

    final iconAsset = _lobeIconAssetAliases[slug] ?? slug;
    final themeSegment = brightness == Brightness.dark ? 'dark' : 'light';
    return '$_lobeStaticPngBase/$themeSegment/$iconAsset.png';
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
