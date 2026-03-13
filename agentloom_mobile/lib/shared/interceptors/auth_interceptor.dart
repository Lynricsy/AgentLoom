import 'package:dio/dio.dart';

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
    required this.retryRequest,
  });

  final TokenStorage tokenStorage;
  final AuthApi authApi;
  final Future<void> Function() onForceLogout;
  final Future<Response<dynamic>> Function(RequestOptions options) retryRequest;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      final tokens = await tokenStorage.readTokens();
      if (tokens != null) {
        options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
      handler.next(options);
    } catch (error, stackTrace) {
      handler.reject(
        DioException(
          requestOptions: options,
          error: error,
          stackTrace: stackTrace,
          message: '读取认证凭证失败',
        ),
      );
    }
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
      await onForceLogout();
      return handler.next(err);
    }

    // token-expired 或未知 type → 尝试 refresh
    final tokens = await tokenStorage.readTokens();
    if (tokens == null) {
      await tokenStorage.clearTokens();
      await onForceLogout();
      return handler.next(err);
    }

    try {
      final latestAccessToken = tokens.accessToken;
      final requestAccessToken = _extractAccessToken(err.requestOptions);

      if (requestAccessToken != null &&
          requestAccessToken != latestAccessToken) {
        final response = await _retryWithAccessToken(
          err.requestOptions,
          latestAccessToken,
        );
        return handler.resolve(response);
      }

      final newTokens = await authApi.refresh(tokens.refreshToken);
      await tokenStorage.saveTokens(newTokens);

      final response = await _retryWithAccessToken(
        err.requestOptions,
        newTokens.accessToken,
      );
      return handler.resolve(response);
    } catch (_) {
      // refresh 失败 → 强制登出
      await tokenStorage.clearTokens();
      await onForceLogout();
      return handler.next(err);
    }
  }

  Future<Response<dynamic>> _retryWithAccessToken(
    RequestOptions requestOptions,
    String accessToken,
  ) {
    requestOptions.headers['Authorization'] = 'Bearer $accessToken';
    return retryRequest(requestOptions);
  }

  /// 从 401 响应体中提取错误类型
  String? _extractErrorType(Response<dynamic>? response) {
    if (response?.data is Map<String, dynamic>) {
      return (response!.data as Map<String, dynamic>)['type'] as String?;
    }
    return null;
  }

  String? _extractAccessToken(RequestOptions requestOptions) {
    final header = requestOptions.headers['Authorization'];
    if (header is! String || !header.startsWith('Bearer ')) {
      return null;
    }

    return header.substring('Bearer '.length);
  }
}
