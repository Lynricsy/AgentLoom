import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/auth_api.dart';
import '../models/auth_state.dart';
import '../models/auth_tokens.dart';
import '../models/login_user.dart';
import '../../notifications/providers/push_notification_provider.dart';
import 'token_storage_provider.dart';

/// 认证状态管理 — AsyncNotifier
///
/// 管理整个应用的认证生命周期：
/// - 初始化时从安全存储读取 tokens
/// - login / logout / refresh 状态转换
class AuthNotifier extends AsyncNotifier<AuthState> {
  late TokenStorage _tokenStorage;

  AuthApi get _authApi => ref.read(authApiProvider);

  @override
  Future<AuthState> build() async {
    _tokenStorage = ref.read(tokenStorageProvider);

    final tokens = await _tokenStorage.readTokens();
    if (tokens == null) {
      return const AuthState.unauthenticated();
    }

    final user = _restoreUserFromAccessToken(tokens.accessToken);

    // 有 stored tokens → 标记为已认证
    return AuthState.authenticated(user: user, tokens: tokens);
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
        // 推送初始化由 AgentLoomApp 的 ref.listen(authProvider) 统一触发，
        // 不在此处直接调用，避免双重触发竞争。

        case AuthLoginMfaRequired(:final mfaToken, :final factors):
          state = AsyncValue.data(
            AuthState.mfaRequired(mfaToken: mfaToken, factors: factors),
          );
      }
    } on DioException catch (e) {
      final message = _extractErrorMessage(e, fallbackMessage: '登录失败，请重试');
      state = AsyncValue.data(AuthState.unauthenticated(message: message));
    } catch (e) {
      state = AsyncValue.data(AuthState.unauthenticated(message: e.toString()));
    }
  }

  /// 邮箱密码注册
  ///
  /// 移动端当前不承接首次组织初始化，因此注册成功后不直接持久化登录态，
  /// 而是交由 UI 引导用户前往 Web Studio 完成 onboarding。
  Future<AuthRegisterResponse?> register(
    String email,
    String password, {
    String? displayName,
  }) async {
    state = const AsyncValue.loading();

    try {
      final normalizedDisplayName = switch (displayName?.trim()) {
        final value? when value.isNotEmpty => value,
        _ => null,
      };
      final response = await _authApi.register(
        email,
        password,
        displayName: normalizedDisplayName,
      );

      if (!ref.mounted) {
        return response;
      }

      state = const AsyncValue.data(AuthState.unauthenticated());
      return response;
    } on DioException catch (e) {
      final message = _extractErrorMessage(e, fallbackMessage: '注册失败，请重试');
      state = AsyncValue.data(AuthState.unauthenticated(message: message));
      return null;
    } catch (e) {
      state = AsyncValue.data(AuthState.unauthenticated(message: '注册失败：$e'));
      return null;
    }
  }

  /// OAuth 登录 — 获取授权 URL 并打开系统浏览器
  ///
  /// 流程：调用服务端获取 OAuth redirect URL → 打开外部浏览器 →
  /// 浏览器完成 OAuth → 重定向到 agentloom://auth/callback →
  /// 深链处理器（auth_callback_screen）接管 token 存储。
  Future<void> signInWithOAuth(String provider) async {
    state = const AsyncValue.loading();

    try {
      final redirectUrl = await _authApi.getOAuthUrl(provider);

      if (!ref.mounted) return;

      if (redirectUrl.isEmpty) {
        state = const AsyncValue.data(
          AuthState.unauthenticated(message: 'OAuth 服务暂不可用，请稍后重试'),
        );
        return;
      }

      final uri = Uri.parse(redirectUrl);
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );

      if (!ref.mounted) return;

      if (!launched) {
        state = const AsyncValue.data(
          AuthState.unauthenticated(message: '无法打开浏览器，请检查设备设置'),
        );
        return;
      }

      // 浏览器已打开，恢复为 unauthenticated 状态（无错误提示）。
      // 用户完成 OAuth 后，深链回调会触发 handleOAuthCallback()。
      // 如果用户取消，app 回到前台时保持 unauthenticated 即可。
      state = const AsyncValue.data(AuthState.unauthenticated());
    } on DioException catch (e) {
      if (!ref.mounted) return;
      final message = _extractErrorMessage(
        e,
        fallbackMessage: 'OAuth 登录失败，请重试',
      );
      state = AsyncValue.data(AuthState.unauthenticated(message: message));
    } catch (e) {
      if (!ref.mounted) return;
      state = AsyncValue.data(
        AuthState.unauthenticated(message: '打开 OAuth 登录失败：${e.toString()}'),
      );
    }
  }

  /// 登出
  Future<void> logout() async {
    try {
      await ref.read(pushNotificationProvider.notifier).cleanupOnLogout();
    } catch (_) {
      // 推送清理失败不影响主登出流程。
    }

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
      await forceLogout();
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
      await forceLogout();
      return false;
    }
  }

  /// 处理 OAuth 回调 tokens（来自 agentloom://auth/callback 深链）
  ///
  /// 将 tokens 保存到安全存储，并更新认证状态为已认证。
  Future<void> handleOAuthCallback(AuthTokens tokens) async {
    await _tokenStorage.saveTokens(tokens);
    final user = _restoreUserFromAccessToken(tokens.accessToken);

    if (!ref.mounted) return;

    state = AsyncValue.data(
      AuthState.authenticated(user: user, tokens: tokens),
    );
  }

  /// MFA 验证成功后完成认证
  ///
  /// 由 MfaNotifier 在 TOTP 验证通过后调用，保存 tokens 并转入已认证状态。
  Future<void> completeMfaAuthentication(AuthTokens tokens) async {
    await _tokenStorage.saveTokens(tokens);
    final user = _restoreUserFromAccessToken(tokens.accessToken);

    if (!ref.mounted) return;

    state = AsyncValue.data(
      AuthState.authenticated(user: user, tokens: tokens),
    );
  }

  /// 更新已认证用户的 tokens（MFA 注册/禁用后刷新 tokens）
  Future<void> updateTokens(AuthTokens tokens) async {
    await _tokenStorage.saveTokens(tokens);

    if (!ref.mounted) return;

    final currentState = state.value;
    if (currentState is AuthStateAuthenticated) {
      state = AsyncValue.data(
        AuthState.authenticated(user: currentState.user, tokens: tokens),
      );
    }
  }

  /// 强制登出（由 AuthInterceptor 调用）
  Future<void> forceLogout({String? message}) async {
    try {
      await ref.read(pushNotificationProvider.notifier).cleanupOnLogout();
    } catch (_) {}

    await _tokenStorage.clearTokens();

    if (!ref.mounted) {
      return;
    }

    state = AsyncValue.data(
      AuthState.unauthenticated(message: message ?? '登录已过期，请重新登录'),
    );
  }

  /// 从 DioException 提取友好错误信息
  String _extractErrorMessage(
    DioException e, {
    required String fallbackMessage,
  }) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return '网络连接超时，请检查网络后重试';
    }

    if (e.type == DioExceptionType.connectionError) {
      return '无法连接到服务器，请检查网络连接';
    }

    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final message = data['message'] ?? data['detail'];
      if (message != null) {
        return message.toString();
      }
    }

    return fallbackMessage;
  }

  LoginUser _restoreUserFromAccessToken(String accessToken) {
    try {
      final parts = accessToken.split('.');
      if (parts.length < 2) {
        return const LoginUser(id: '', email: '');
      }

      final normalizedPayload = base64Url.normalize(parts[1]);
      final payload = utf8.decode(base64Url.decode(normalizedPayload));
      final decoded = jsonDecode(payload);
      if (decoded is! Map<String, dynamic>) {
        return const LoginUser(id: '', email: '');
      }

      return LoginUser(
        id: decoded['sub']?.toString() ?? '',
        email: decoded['email']?.toString() ?? '',
      );
    } catch (_) {
      return const LoginUser(id: '', email: '');
    }
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
