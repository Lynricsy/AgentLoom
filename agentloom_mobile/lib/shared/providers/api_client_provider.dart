import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/constants.dart';
import 'env_provider.dart';

/// ApiClient Provider — 提供已配置的 Dio 实例
///
/// 从 [envProvider] 读取 API 基础地址，配置超时和默认请求头。
final apiClientProvider = Provider<Dio>((ref) {
  final env = ref.watch(envProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: env.apiBaseUrl,
      connectTimeout: AppConstants.connectTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ),
  );

  // TODO(auth): Story 7.3a 注入 AuthInterceptor

  return dio;
});
