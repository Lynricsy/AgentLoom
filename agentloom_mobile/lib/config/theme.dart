import 'package:flutter/material.dart';

/// AgentLoom 主题系统
///
/// 视觉方向：浅色科技工作台
/// 技术基线：Material 3
class AppTheme {
  AppTheme._();

  static const Color _primary = Color(0xFF0B6BFF);
  static const Color _secondary = Color(0xFF14B8D4);
  static const Color _background = Color(0xFFF3F7FA);
  static const Color _surface = Color(0xFFFFFFFF);
  static const Color _surfaceLow = Color(0xFFF8FBFD);
  static const Color _surfaceHigh = Color(0xFFE8F0F5);
  static const Color _outline = Color(0xFFD6E2EA);
  static const Color _textPrimary = Color(0xFF132437);
  static const Color _textMuted = Color(0xFF61758A);
  static const Color _success = Color(0xFF0F9D7A);
  static const Color _warning = Color(0xFFC97A18);
  static const Color _error = Color(0xFFD64545);
  static const List<String> _cjkFontFallback = [
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'Source Han Sans SC',
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    'WenQuanYi Micro Hei',
    'Arial Unicode MS',
  ];

  /// Light 主题
  static ThemeData light() {
    final baseScheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.light,
    );
    final colorScheme = baseScheme.copyWith(
      primary: _primary,
      secondary: _secondary,
      tertiary: const Color(0xFF123A6A),
      surface: _surface,
      surfaceContainerLowest: _surface,
      surfaceContainerLow: _surfaceLow,
      surfaceContainer: const Color(0xFFF1F6F9),
      surfaceContainerHigh: _surfaceHigh,
      outline: _outline,
      outlineVariant: const Color(0xFFE7EEF3),
      onSurface: _textPrimary,
      onSurfaceVariant: _textMuted,
      error: _error,
    );

    final baseTextTheme = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
    ).textTheme;
    final textTheme = _withCjkFallbackTheme(
      baseTextTheme.copyWith(
        headlineLarge: baseTextTheme.headlineLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: _textPrimary,
          letterSpacing: -0.6,
        ),
        headlineMedium: baseTextTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: _textPrimary,
          letterSpacing: -0.3,
        ),
        titleLarge: baseTextTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          color: _textPrimary,
        ),
        titleMedium: baseTextTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: _textPrimary,
        ),
        titleSmall: baseTextTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: _textPrimary,
        ),
        bodyLarge: baseTextTheme.bodyLarge?.copyWith(
          color: _textPrimary,
          height: 1.35,
        ),
        bodyMedium: baseTextTheme.bodyMedium?.copyWith(
          color: _textPrimary,
          height: 1.4,
        ),
        bodySmall: baseTextTheme.bodySmall?.copyWith(
          color: _textMuted,
          height: 1.35,
        ),
        labelLarge: baseTextTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
    );
    final chipLabelStyle =
        textTheme.labelMedium ??
        const TextStyle(fontSize: 12, fontWeight: FontWeight.w600);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: _background,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: _textPrimary,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: _surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: _outline),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFFE5EEF4),
        space: 1,
        thickness: 1,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: _surface.withValues(alpha: 0.95),
        surfaceTintColor: Colors.transparent,
        indicatorColor: _primary.withValues(alpha: 0.12),
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return textTheme.labelSmall?.copyWith(
            color: selected ? _primary : _textMuted,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? _primary : _textMuted,
            size: selected ? 24 : 22,
          );
        }),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _surfaceLow,
        hintStyle: textTheme.bodyMedium?.copyWith(color: _textMuted),
        labelStyle: textTheme.bodyMedium?.copyWith(color: _textMuted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 18,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: _outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: _outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: _primary, width: 1.6),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFD6E2EA),
          disabledForegroundColor: const Color(0xFF94A6B6),
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: _textPrimary,
          side: const BorderSide(color: _outline),
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        iconColor: _textMuted,
        textColor: _textPrimary,
        tileColor: _surface,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: _textPrimary,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: _surfaceHigh,
        selectedColor: _primary.withValues(alpha: 0.12),
        secondarySelectedColor: _secondary.withValues(alpha: 0.12),
        side: const BorderSide(color: _outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: chipLabelStyle,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: _surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      extensions: const <ThemeExtension<dynamic>>[
        AppSemanticColors(success: _success, warning: _warning, error: _error),
      ],
    );
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.dark,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
    );
  }

  static TextTheme _withCjkFallbackTheme(TextTheme theme) {
    return TextTheme(
      displayLarge: _withCjkFallback(theme.displayLarge),
      displayMedium: _withCjkFallback(theme.displayMedium),
      displaySmall: _withCjkFallback(theme.displaySmall),
      headlineLarge: _withCjkFallback(theme.headlineLarge),
      headlineMedium: _withCjkFallback(theme.headlineMedium),
      headlineSmall: _withCjkFallback(theme.headlineSmall),
      titleLarge: _withCjkFallback(theme.titleLarge),
      titleMedium: _withCjkFallback(theme.titleMedium),
      titleSmall: _withCjkFallback(theme.titleSmall),
      bodyLarge: _withCjkFallback(theme.bodyLarge),
      bodyMedium: _withCjkFallback(theme.bodyMedium),
      bodySmall: _withCjkFallback(theme.bodySmall),
      labelLarge: _withCjkFallback(theme.labelLarge),
      labelMedium: _withCjkFallback(theme.labelMedium),
      labelSmall: _withCjkFallback(theme.labelSmall),
    );
  }

  static TextStyle? _withCjkFallback(TextStyle? style) {
    return style?.copyWith(fontFamilyFallback: _cjkFontFallback);
  }
}

/// 语义色扩展
class AppSemanticColors extends ThemeExtension<AppSemanticColors> {
  const AppSemanticColors({
    required this.success,
    required this.warning,
    required this.error,
  });

  final Color success;
  final Color warning;
  final Color error;

  @override
  AppSemanticColors copyWith({Color? success, Color? warning, Color? error}) {
    return AppSemanticColors(
      success: success ?? this.success,
      warning: warning ?? this.warning,
      error: error ?? this.error,
    );
  }

  @override
  AppSemanticColors lerp(
    covariant ThemeExtension<AppSemanticColors>? other,
    double t,
  ) {
    if (other is! AppSemanticColors) {
      return this;
    }

    return AppSemanticColors(
      success: Color.lerp(success, other.success, t) ?? success,
      warning: Color.lerp(warning, other.warning, t) ?? warning,
      error: Color.lerp(error, other.error, t) ?? error,
    );
  }
}
