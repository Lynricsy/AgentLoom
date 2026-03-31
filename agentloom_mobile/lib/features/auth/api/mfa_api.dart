import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/constants.dart';
import '../../../shared/providers/env_provider.dart';
import '../models/auth_tokens.dart';

/// MFA TOTP 注册响应
class MfaEnrollResponse {
  const MfaEnrollResponse({
    required this.factorId,
    required this.qrCode,
    required this.secret,
    required this.uri,
  });

  final String factorId;
  final String qrCode;
  final String secret;
  final String uri;
}

/// MFA API — TOTP 注册、验证、禁用
///
/// 注册接口需要 Bearer token（已认证用户），
/// 登录验证接口为公开接口（使用 mfaToken），
/// 禁用接口需要 Bearer token。
class MfaApi {
  MfaApi(this._dio);

  final Dio _dio;

  /// TOTP 注册 — 需要 Bearer auth
  Future<MfaEnrollResponse> enrollTotp(String accessToken) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/mfa/totp/enroll',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final data = response.data!;
    return MfaEnrollResponse(
      factorId: (data['id'] ?? '') as String,
      qrCode: (data['qr_code'] ?? data['qrCode'] ?? '') as String,
      secret: (data['secret'] ?? '') as String,
      uri: (data['uri'] ?? '') as String,
    );
  }

  /// 登录 MFA 验证 — 公开接口，使用 mfaToken
  Future<AuthTokens> verifyMfaLogin({
    required String mfaToken,
    required String factorId,
    required String code,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/mfa/login/verify',
      data: {'mfa_token': mfaToken, 'factor_id': factorId, 'code': code},
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
  }

  /// TOTP 验证（注册确认） — 公开接口
  Future<AuthTokens> verifyTotp({
    required String factorId,
    required String code,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/v1/auth/mfa/totp/verify',
      data: {'factor_id': factorId, 'code': code},
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
  }

  /// 禁用 MFA — 需要 Bearer auth
  Future<AuthTokens> disableMfa({
    required String accessToken,
    required String code,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      '/api/v1/auth/mfa',
      data: {'code': code},
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
  }
}

/// MfaApi 使用 authDio（不注入 AuthInterceptor，与 AuthApi 一致）
final mfaApiProvider = Provider<MfaApi>((ref) {
  final env = ref.watch(envProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: env.apiBaseUrl,
      connectTimeout: AppConstants.connectTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ),
  );
  return MfaApi(dio);
});
