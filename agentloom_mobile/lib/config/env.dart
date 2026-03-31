import 'package:flutter_dotenv/flutter_dotenv.dart';

/// 应用环境枚举
enum AppEnvironment {
  dev,
  staging,
  prod;

  /// 从字符串解析环境
  static AppEnvironment fromString(String value) {
    return AppEnvironment.values.firstWhere(
      (e) => e.name == value,
      orElse: () => AppEnvironment.dev,
    );
  }
}

/// 环境配置
///
/// 客户端内部统一以 Studio 基础地址作为连接真源：
/// - `studioBaseUrl` 用于 Web Studio handoff
/// - `apiBaseUrl` 从 `studioBaseUrl` 推导为 `/api/v1`
class EnvConfig {
  const EnvConfig({
    required this.studioBaseUrl,
    required this.appName,
    required this.environment,
  });

  final String studioBaseUrl;
  final String appName;
  final AppEnvironment environment;

  /// API 基础地址
  String get apiBaseUrl => deriveApiBaseUrl(studioBaseUrl);

  /// 便于 UI 展示的 host:port
  String get displayHost {
    final uri = Uri.parse(studioBaseUrl);
    final port = uri.hasPort ? ':${uri.port}' : '';
    return '${uri.host}$port';
  }

  EnvConfig copyWith({
    String? studioBaseUrl,
    String? appName,
    AppEnvironment? environment,
  }) {
    return EnvConfig(
      studioBaseUrl: studioBaseUrl ?? this.studioBaseUrl,
      appName: appName ?? this.appName,
      environment: environment ?? this.environment,
    );
  }

  /// 从 dotenv 加载配置
  ///
  /// 优先读取 `STUDIO_BASE_URL`，其次兼容旧的 `API_BASE_URL`。
  factory EnvConfig.fromDotEnv({required AppEnvironment environment}) {
    final studioBaseUrl = dotenv.env['STUDIO_BASE_URL'];
    final apiBaseUrl = dotenv.env['API_BASE_URL'];

    final resolvedStudioBaseUrl = studioBaseUrl != null && studioBaseUrl.isNotEmpty
        ? normalizeStudioBaseUrl(studioBaseUrl)
        : deriveStudioBaseUrlFromApiBaseUrl(
            apiBaseUrl ?? 'http://localhost:3000/api/v1',
          );

    return EnvConfig(
      studioBaseUrl: resolvedStudioBaseUrl,
      appName: dotenv.env['APP_NAME'] ?? 'AgentLoom',
      environment: environment,
    );
  }

  /// 规范化 Studio 基础地址。
  ///
  /// 支持用户直接输入：
  /// - `agentloom.ling.plus`
  /// - `https://agentloom.ling.plus`
  /// - `https://agentloom.ling.plus/api/v1`
  static String normalizeStudioBaseUrl(String input) {
    final trimmed = input.trim();
    if (trimmed.isEmpty) {
      throw const FormatException('Studio 地址不能为空');
    }

    final withScheme = _ensureScheme(trimmed);
    final uri = Uri.tryParse(withScheme);
    if (uri == null || uri.host.isEmpty) {
      throw const FormatException('Studio 地址格式无效');
    }

    final normalizedPath = _stripKnownApiSuffix(uri.path);

    return uri
        .replace(
          path: normalizedPath,
          query: null,
          fragment: null,
        )
        .toString()
        .replaceFirst(RegExp(r'/$'), '');
  }

  /// 根据 API 地址反推 Studio 基础地址。
  static String deriveStudioBaseUrlFromApiBaseUrl(String apiBaseUrl) {
    final uri = Uri.parse(_ensureScheme(apiBaseUrl.trim()));
    final normalizedPath = _stripKnownApiSuffix(uri.path);

    return uri
        .replace(
          path: normalizedPath,
          query: null,
          fragment: null,
        )
        .toString()
        .replaceFirst(RegExp(r'/$'), '');
  }

  /// 根据 Studio 基础地址推导 API 地址。
  static String deriveApiBaseUrl(String studioBaseUrl) {
    final normalizedStudioBaseUrl = normalizeStudioBaseUrl(studioBaseUrl);
    final uri = Uri.parse(normalizedStudioBaseUrl);
    final basePath = uri.path == '/' ? '' : uri.path.replaceFirst(RegExp(r'/$'), '');
    final apiPath = basePath.isEmpty ? '/api/v1' : '$basePath/api/v1';

    return uri
        .replace(
          path: apiPath,
          query: null,
          fragment: null,
        )
        .toString();
  }

  static String _ensureScheme(String raw) {
    if (raw.contains('://')) {
      return raw;
    }

    final normalized = raw.replaceFirst(RegExp(r'^/+'), '');
    final isLocalHost = normalized.startsWith('localhost') ||
        RegExp(r'^\d{1,3}(\.\d{1,3}){3}(:\d+)?').hasMatch(normalized);

    return '${isLocalHost ? 'http' : 'https'}://$normalized';
  }

  static String _stripKnownApiSuffix(String path) {
    final normalizedPath = path.replaceFirst(RegExp(r'/$'), '');

    if (normalizedPath.isEmpty || normalizedPath == '/') {
      return '';
    }

    if (normalizedPath.endsWith('/api/v1')) {
      return normalizedPath.substring(
        0,
        normalizedPath.length - '/api/v1'.length,
      );
    }

    if (normalizedPath.endsWith('/api')) {
      return normalizedPath.substring(
        0,
        normalizedPath.length - '/api'.length,
      );
    }

    return normalizedPath;
  }
}
