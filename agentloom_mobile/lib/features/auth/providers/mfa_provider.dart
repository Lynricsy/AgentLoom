import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/mfa_api.dart';
import '../models/auth_state.dart';
import 'auth_provider.dart';

/// MFA 操作状态
sealed class MfaState {
  const MfaState();
}

/// 初始/空闲状态
class MfaIdle extends MfaState {
  const MfaIdle();
}

/// 加载中
class MfaLoading extends MfaState {
  const MfaLoading();
}

/// 注册成功 — 返回 QR 码信息
class MfaEnrollSuccess extends MfaState {
  const MfaEnrollSuccess({
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

/// 登录验证成功
class MfaLoginVerifySuccess extends MfaState {
  const MfaLoginVerifySuccess();
}

/// 注册验证成功
class MfaVerifySuccess extends MfaState {
  const MfaVerifySuccess();
}

/// 禁用成功
class MfaDisableSuccess extends MfaState {
  const MfaDisableSuccess();
}

/// 操作失败
class MfaError extends MfaState {
  const MfaError({required this.message});
  final String message;
}

/// MFA 状态管理 Notifier
///
/// 管理 TOTP 注册、登录验证、禁用等操作。
/// 遵循项目约定：手写 Notifier + ref.mounted 守卫。
/// 认证状态更新委托给 AuthNotifier 的公开方法（避免直接设置 protected state）。
class MfaNotifier extends Notifier<MfaState> {
  @override
  MfaState build() => const MfaIdle();

  /// TOTP 注册 — 已认证用户发起
  Future<void> enrollTotp() async {
    state = const MfaLoading();

    try {
      final authState = ref.read(authProvider).value;
      if (authState is! AuthStateAuthenticated) {
        state = const MfaError(message: '请先登录');
        return;
      }

      final mfaApi = ref.read(mfaApiProvider);
      final result = await mfaApi.enrollTotp(authState.tokens.accessToken);

      if (!ref.mounted) return;

      state = MfaEnrollSuccess(
        factorId: result.factorId,
        qrCode: result.qrCode,
        secret: result.secret,
        uri: result.uri,
      );
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: e.toString());
    }
  }

  /// 登录 MFA 验证 — 登录流程中使用 mfaToken
  Future<void> verifyMfaLogin({
    required String mfaToken,
    required String factorId,
    required String code,
  }) async {
    state = const MfaLoading();

    try {
      final mfaApi = ref.read(mfaApiProvider);
      final tokens = await mfaApi.verifyMfaLogin(
        mfaToken: mfaToken,
        factorId: factorId,
        code: code,
      );

      if (!ref.mounted) return;

      // 委托 AuthNotifier 完成认证状态转换
      await ref.read(authProvider.notifier).completeMfaAuthentication(tokens);

      if (!ref.mounted) return;

      state = const MfaLoginVerifySuccess();
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: e.toString());
    }
  }

  /// TOTP 注册确认验证
  Future<void> verifyTotp({
    required String factorId,
    required String code,
  }) async {
    state = const MfaLoading();

    try {
      final mfaApi = ref.read(mfaApiProvider);
      final tokens = await mfaApi.verifyTotp(factorId: factorId, code: code);

      if (!ref.mounted) return;

      // 委托 AuthNotifier 更新 tokens
      await ref.read(authProvider.notifier).updateTokens(tokens);

      if (!ref.mounted) return;

      state = const MfaVerifySuccess();
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: e.toString());
    }
  }

  /// 禁用 MFA
  Future<void> disableMfa({required String code}) async {
    state = const MfaLoading();

    try {
      final authState = ref.read(authProvider).value;
      if (authState is! AuthStateAuthenticated) {
        state = const MfaError(message: '请先登录');
        return;
      }

      final mfaApi = ref.read(mfaApiProvider);
      final tokens = await mfaApi.disableMfa(
        accessToken: authState.tokens.accessToken,
        code: code,
      );

      if (!ref.mounted) return;

      // 委托 AuthNotifier 更新 tokens
      await ref.read(authProvider.notifier).updateTokens(tokens);

      if (!ref.mounted) return;

      state = const MfaDisableSuccess();
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = MfaError(message: e.toString());
    }
  }

  /// 重置为空闲状态
  void reset() {
    state = const MfaIdle();
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
      final message = data['message'] ?? data['detail'];
      if (message != null) {
        return message.toString();
      }
    }

    return '验证失败，请重试';
  }
}

/// MFA 状态 Provider
final mfaProvider = NotifierProvider<MfaNotifier, MfaState>(MfaNotifier.new);
