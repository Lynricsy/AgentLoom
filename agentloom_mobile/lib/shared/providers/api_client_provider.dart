import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/constants.dart';
import '../../features/auth/api/auth_api.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/providers/token_storage_provider.dart';
import '../interceptors/auth_interceptor.dart';
import 'env_provider.dart';

/// ApiClient Provider — 提供已配置的 Dio 实例（含 AuthInterceptor）
///
/// 从 [envProvider] 读取 API 基础地址，配置超时、默认请求头和认证拦截器。
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

  // 注入 AuthInterceptor
  final tokenStorage = ref.read(tokenStorageProvider);
  final authApi = ref.read(authApiProvider);

  dio.interceptors.add(
    AuthInterceptor(
      tokenStorage: tokenStorage,
      authApi: authApi,
      onForceLogout: () async {
        await ref.read(authProvider.notifier).forceLogout();
      },
      retryRequest: (options) => dio.fetch<dynamic>(options),
    ),
  );

  return dio;
});
