/// 全局常量
class AppConstants {
  AppConstants._();

  /// 应用版本
  static const String appVersion = '0.1.0';

  /// API 请求超时
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// 应用名称
  static const String appName = 'AgentLoom';
}
