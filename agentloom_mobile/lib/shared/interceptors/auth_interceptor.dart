import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../features/auth/api/auth_api.dart';
import '../../features/auth/providers/token_storage_provider.dart';

/// Dio 认证拦截器 — 自动附加 Bearer + 401 刷新重试
///
/// 使用 [QueuedInterceptorsWrapper] 序列化并发 401 处理，
/// 确保 token 刷新期间不会发起重复的 refresh 请求。
class AuthInterceptor extends QueuedInterceptorsWrapper {
  AuthInterceptor({
    required this.tokenStorage,
    required this.authApi,
    required this.onForceLogout,
  });

  final TokenStorage tokenStorage;
  final AuthApi authApi;
  final VoidCallback onForceLogout;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final tokens = await tokenStorage.readTokens();
    if (tokens != null) {
      options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    final errorType = _extractErrorType(err.response);

    // token-revoked / token-invalid / token-missing → 强制登出，不尝试 refresh
    if (errorType == 'token-revoked' ||
        errorType == 'token-invalid' ||
        errorType == 'token-missing') {
      await tokenStorage.clearTokens();
      onForceLogout();
      return handler.next(err);
    }

    // token-expired 或未知 type → 尝试 refresh
    final tokens = await tokenStorage.readTokens();
    if (tokens == null) {
      onForceLogout();
      return handler.next(err);
    }

    try {
      final newTokens = await authApi.refresh(tokens.refreshToken);
      await tokenStorage.saveTokens(newTokens);

      // 使用新 token 重试原请求
      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer ${newTokens.accessToken}';

      final response = await Dio().fetch<dynamic>(retryOptions);
      return handler.resolve(response);
    } catch (_) {
      // refresh 失败 → 强制登出
      await tokenStorage.clearTokens();
      onForceLogout();
      return handler.next(err);
    }
  }

  /// 从 401 响应体中提取错误类型
  String? _extractErrorType(Response<dynamic>? response) {
    if (response?.data is Map<String, dynamic>) {
      return (response!.data as Map<String, dynamic>)['type'] as String?;
    }
    return null;
  }
}
