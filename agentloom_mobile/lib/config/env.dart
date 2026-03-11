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
class EnvConfig {
  const EnvConfig({
    required this.apiBaseUrl,
    required this.appName,
    required this.environment,
  });

  final String apiBaseUrl;
  final String appName;
  final AppEnvironment environment;

  /// 从 dotenv 加载配置
  factory EnvConfig.fromDotEnv({required AppEnvironment environment}) {
    return EnvConfig(
      apiBaseUrl: dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api/v1',
      appName: dotenv.env['APP_NAME'] ?? 'AgentLoom',
      environment: environment,
    );
  }
}
