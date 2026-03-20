import 'package:flutter/material.dart';

/// OAuth 登录按钮 — 统一样式的第三方登录按钮
///
/// 支持自定义 provider 名称、图标、品牌色。
/// [isLoading] 为 true 时禁用按钮，防止重复触发。
class OAuthButton extends StatelessWidget {
  const OAuthButton({
    super.key,
    required this.provider,
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.onPressed,
    this.isLoading = false,
  });

  /// OAuth provider 标识（如 'google', 'github'）
  final String provider;

  /// 按钮显示文本
  final String label;

  /// 按钮图标
  final IconData icon;

  /// 按钮背景色（品牌色）
  final Color backgroundColor;

  /// 按钮前景色（文字/图标）
  final Color foregroundColor;

  /// 点击回调
  final VoidCallback onPressed;

  /// 是否处于加载状态（整个登录流程共享）
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          disabledBackgroundColor: backgroundColor.withValues(alpha: 0.6),
          disabledForegroundColor: foregroundColor.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        icon: Icon(icon, size: 24),
        label: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}
