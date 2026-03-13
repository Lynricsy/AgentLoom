import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/auth_api.dart';
import '../models/auth_state.dart';
import '../models/auth_tokens.dart';
import '../models/login_user.dart';
import 'token_storage_provider.dart';

/// 认证状态管理 — AsyncNotifier
///
/// 管理整个应用的认证生命周期：
/// - 初始化时从安全存储读取 tokens
/// - login / logout / refresh 状态转换
class AuthNotifier extends AsyncNotifier<AuthState> {
  late TokenStorage _tokenStorage;
  late AuthApi _authApi;

  @override
  Future<AuthState> build() async {
    _tokenStorage = ref.read(tokenStorageProvider);
    _authApi = ref.read(authApiProvider);

    final tokens = await _tokenStorage.readTokens();
    if (tokens == null) {
      return const AuthState.unauthenticated();
    }

    // 有 stored tokens → 标记为已认证
    // user 信息暂用占位（后续可从 JWT 解析）
    return AuthState.authenticated(
      user: LoginUser(id: '', email: ''),
      tokens: tokens,
    );
  }

  /// 邮箱密码登录
  Future<void> login(String email, String password) async {
    state = const AsyncValue.loading();

    try {
      final response = await _authApi.login(email, password);

      switch (response) {
        case AuthLoginSuccess(:final user, :final tokens):
          await _tokenStorage.saveTokens(tokens);
          state = AsyncValue.data(
            AuthState.authenticated(user: user, tokens: tokens),
          );

        case AuthLoginMfaRequired(:final mfaToken, :final factors):
          state = AsyncValue.data(
            AuthState.mfaRequired(mfaToken: mfaToken, factors: factors),
          );
      }
    } on DioException catch (e) {
      final message = _extractErrorMessage(e);
      state = AsyncValue.data(AuthState.unauthenticated(message: message));
    } catch (e) {
      state = AsyncValue.data(AuthState.unauthenticated(message: e.toString()));
    }
  }

  /// 登出
  Future<void> logout() async {
    // fire-and-forget: 尝试通知服务端，不等待结果
    final tokens = await _tokenStorage.readTokens();
    if (tokens != null) {
      _authApi.logout(tokens.accessToken).catchError((_) {});
    }

    await _tokenStorage.clearTokens();
    state = const AsyncValue.data(AuthState.unauthenticated());
  }

  /// 刷新 tokens
  Future<bool> refreshTokens() async {
    final tokens = await _tokenStorage.readTokens();
    if (tokens == null) {
      state = const AsyncValue.data(AuthState.unauthenticated());
      return false;
    }

    try {
      final newTokens = await _authApi.refresh(tokens.refreshToken);
      await _tokenStorage.saveTokens(newTokens);

      // 更新状态中的 tokens
      final currentState = state.value;
      if (currentState is AuthStateAuthenticated) {
        state = AsyncValue.data(
          AuthState.authenticated(user: currentState.user, tokens: newTokens),
        );
      }
      return true;
    } catch (_) {
      await _tokenStorage.clearTokens();
      state = const AsyncValue.data(AuthState.unauthenticated());
      return false;
    }
  }

  /// 强制登出（由 AuthInterceptor 调用）
  void forceLogout({String? message}) {
    state = AsyncValue.data(
      AuthState.unauthenticated(message: message ?? '登录已过期，请重新登录'),
    );
  }

  /// 从 DioException 提取友好错误信息
  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return '网络连接超时，请检查网络后重试';
    }

    if (e.type == DioExceptionType.connectionError) {
      return '无法连接到服务器，请检查网络连接';
    }

    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      return (data['message'] ?? data['detail'] ?? '登录失败，请重试') as String;
    }

    return '登录失败，请重试';
  }
}

/// 认证状态 Provider
final authProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

/// 便捷 getter: 是否已认证
final isAuthenticatedProvider = Provider<bool>((ref) {
  final authState = ref.watch(authProvider);
  return authState.value is AuthStateAuthenticated;
});
