import 'package:flutter/material.dart';

const _brandLogoAsset = 'assets/branding/logo-transparent.png';

/// 统一品牌图标组件
///
/// 使用同一份项目 logo 资源，避免登录页、壳层导航等位置继续各写一套占位图形。
class BrandLogoMark extends StatelessWidget {
  const BrandLogoMark({
    super.key,
    this.size = 56,
    this.padding = 10,
    this.borderRadius = 18,
    this.backgroundColor,
    this.borderColor,
    this.shadowColor,
  });

  final double size;
  final double padding;
  final double borderRadius;
  final Color? backgroundColor;
  final Color? borderColor;
  final Color? shadowColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedBackground =
        backgroundColor ?? theme.colorScheme.surface.withValues(alpha: 0.98);
    final resolvedBorder = borderColor ?? theme.colorScheme.outlineVariant;
    final resolvedShadow =
        shadowColor ?? theme.colorScheme.primary.withValues(alpha: 0.12);

    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        color: resolvedBackground,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: resolvedBorder),
        boxShadow: [
          BoxShadow(
            color: resolvedShadow,
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Image.asset(
        _brandLogoAsset,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) {
          return Icon(
            Icons.hub_rounded,
            color: theme.colorScheme.primary,
            size: size * 0.52,
          );
        },
      ),
    );
  }
}
