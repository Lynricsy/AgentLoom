import 'package:flutter/material.dart';

/// AgentLoom 主题系统
class AppTheme {
  AppTheme._();

  /// 品牌主色
  static const Color _brandColor = Color(0xFF6366F1); // Indigo-500

  /// Light 主题
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: _brandColor,
      brightness: Brightness.light,
      appBarTheme: const AppBarTheme(centerTitle: true, elevation: 0),
    );
  }

  // TODO(theme): Story 后续实现 Dark 主题
  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: _brandColor,
      brightness: Brightness.dark,
    );
  }
}
