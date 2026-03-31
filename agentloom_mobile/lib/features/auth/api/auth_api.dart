import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/constants.dart';
import '../../../shared/providers/env_provider.dart';
import '../models/auth_tokens.dart';
import '../models/login_user.dart';

/// 登录响应 — 联合类型，区分正常登录与 MFA 分支
sealed class AuthLoginResponse {
  const AuthLoginResponse();
}

/// 正常登录成功
class AuthLoginSuccess extends AuthLoginResponse {
  const AuthLoginSuccess({required this.user, required this.tokens});
  final LoginUser user;
  final AuthTokens tokens;
}

/// MFA 验证所需
class AuthLoginMfaRequired extends AuthLoginResponse {
  const AuthLoginMfaRequired({required this.mfaToken, required this.factors});
  final String mfaToken;
  final List<Map<String, dynamic>> factors;
}

/// 注册响应 — 联合类型
sealed class AuthRegisterResponse {
  const AuthRegisterResponse();
}

/// 注册成功（直接返回 tokens）
class AuthRegisterSuccess extends AuthRegisterResponse {
  const AuthRegisterSuccess({required this.user, required this.tokens});
  final LoginUser user;
  final AuthTokens tokens;
}

/// 注册需要邮箱确认
class AuthRegisterEmailConfirmation extends AuthRegisterResponse {
  const AuthRegisterEmailConfirmation();
}

/// 认证 API — 使用独立 Dio 实例（不注入 AuthInterceptor，避免循环）
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  /// 邮箱密码登录
  Future<AuthLoginResponse> login(String email, String password) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login',
      data: {'email': email, 'password': password},
    );

    final data = response.data!['data'] as Map<String, dynamic>;

    // MFA 分支
    if (data['mfaRequired'] == true || data['mfa_required'] == true) {
      return AuthLoginMfaRequired(
        mfaToken: (data['mfaToken'] ?? data['mfa_token'] ?? '') as String,
        factors: List<Map<String, dynamic>>.from(
          (data['factors'] ?? []) as List,
        ),
      );
    }

    // 正常登录
    final user = LoginUser.fromJson(data['user'] as Map<String, dynamic>);
    final tokens = AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
    return AuthLoginSuccess(user: user, tokens: tokens);
  }

  /// 注册
  Future<AuthRegisterResponse> register(
    String email,
    String password, {
    String? displayName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/register',
      data: {
        'email': email,
        'password': password,
        if (displayName != null) 'display_name': displayName,
      },
    );

    final data = response.data!['data'] as Map<String, dynamic>;

    if (data['email_confirmation_required'] == true) {
      return const AuthRegisterEmailConfirmation();
    }

    final user = LoginUser.fromJson(data['user'] as Map<String, dynamic>);
    final tokens = AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
    return AuthRegisterSuccess(user: user, tokens: tokens);
  }

  /// Token 刷新
  Future<AuthTokens> refresh(String refreshToken) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/refresh',
      data: {'refresh_token': refreshToken},
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
  }

  /// 登出
  Future<void> logout(String accessToken) async {
    await _dio.post<void>(
      '/api/v1/auth/logout',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
  }

  /// 获取 OAuth 授权跳转 URL
  ///
  /// 调用 `POST /auth/oauth/:provider`，传入 `platform: 'mobile'`，
  /// 服务端返回包含 OAuth 授权页面的 redirect URL。
  Future<String> getOAuthUrl(
    String provider, {
    String platform = 'mobile',
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/oauth/$provider',
      data: {'redirect_url': null, 'platform': platform},
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return (data['url'] ?? data['redirect_url'] ?? '') as String;
  }
}

/// AuthApi 使用的独立 Dio 实例（不注入 AuthInterceptor）
final authDioProvider = Provider<Dio>((ref) {
  final env = ref.watch(envProvider);
  return Dio(
    BaseOptions(
      baseUrl: env.apiBaseUrl,
      connectTimeout: AppConstants.connectTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ),
  );
});

/// AuthApi Provider
final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(ref.watch(authDioProvider));
});
