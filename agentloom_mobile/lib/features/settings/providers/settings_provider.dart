import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/settings_api.dart';

/// 会话列表 Notifier — 管理活跃会话的获取与注销
class SessionListNotifier extends AsyncNotifier<List<SessionInfo>> {
  @override
  Future<List<SessionInfo>> build() async {
    final api = ref.read(settingsApiProvider);
    return api.getSessions();
  }

  /// 刷新会话列表
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(settingsApiProvider);
      return api.getSessions();
    });
  }

  /// 注销指定会话
  Future<void> revokeSession(String sessionId) async {
    try {
      final api = ref.read(settingsApiProvider);
      await api.revokeSession(sessionId);

      if (!ref.mounted) return;

      // 从列表中移除已注销的会话
      final current = state.value;
      if (current != null) {
        state = AsyncValue.data(
          current.where((s) => s.id != sessionId).toList(),
        );
      }
    } on DioException catch (e) {
      if (!ref.mounted) return;
      throw _extractErrorMessage(e);
    }
  }
}

/// 安全信息 Notifier — 获取 MFA 状态等安全配置
class SecurityInfoNotifier extends AsyncNotifier<SecurityInfo> {
  @override
  Future<SecurityInfo> build() async {
    final api = ref.read(settingsApiProvider);
    return api.getSecurityInfo();
  }

  /// 刷新安全信息
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(settingsApiProvider);
      return api.getSecurityInfo();
    });
  }
}

/// 密码修改操作状态
sealed class ChangePasswordState {
  const ChangePasswordState();
}

class ChangePasswordIdle extends ChangePasswordState {
  const ChangePasswordIdle();
}

class ChangePasswordLoading extends ChangePasswordState {
  const ChangePasswordLoading();
}

class ChangePasswordSuccess extends ChangePasswordState {
  const ChangePasswordSuccess();
}

class ChangePasswordError extends ChangePasswordState {
  const ChangePasswordError({required this.message});
  final String message;
}

/// 密码修改 Notifier
class ChangePasswordNotifier extends Notifier<ChangePasswordState> {
  @override
  ChangePasswordState build() => const ChangePasswordIdle();

  /// 执行密码修改
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    state = const ChangePasswordLoading();

    try {
      final api = ref.read(settingsApiProvider);
      await api.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );

      if (!ref.mounted) return;
      state = const ChangePasswordSuccess();
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = ChangePasswordError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = ChangePasswordError(message: e.toString());
    }
  }

  /// 重置为空闲状态
  void reset() {
    state = const ChangePasswordIdle();
  }
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

  return '操作失败，请重试';
}

/// 会话列表 Provider
final sessionListProvider =
    AsyncNotifierProvider<SessionListNotifier, List<SessionInfo>>(
      SessionListNotifier.new,
    );

/// 安全信息 Provider
final securityInfoProvider =
    AsyncNotifierProvider<SecurityInfoNotifier, SecurityInfo>(
      SecurityInfoNotifier.new,
    );

/// 密码修改 Provider
final changePasswordProvider =
    NotifierProvider<ChangePasswordNotifier, ChangePasswordState>(
      ChangePasswordNotifier.new,
    );

// ---------------------------------------------------------------------------
// 注销所有会话
// ---------------------------------------------------------------------------

/// 注销所有会话操作状态
sealed class RevokeAllSessionsState {
  const RevokeAllSessionsState();
}

class RevokeAllSessionsIdle extends RevokeAllSessionsState {
  const RevokeAllSessionsIdle();
}

class RevokeAllSessionsLoading extends RevokeAllSessionsState {
  const RevokeAllSessionsLoading();
}

class RevokeAllSessionsSuccess extends RevokeAllSessionsState {
  const RevokeAllSessionsSuccess();
}

class RevokeAllSessionsError extends RevokeAllSessionsState {
  const RevokeAllSessionsError({required this.message});
  final String message;
}

/// 注销所有会话 Notifier
class RevokeAllSessionsNotifier extends Notifier<RevokeAllSessionsState> {
  @override
  RevokeAllSessionsState build() => const RevokeAllSessionsIdle();

  /// 执行注销所有会话
  Future<void> revokeAll() async {
    state = const RevokeAllSessionsLoading();

    try {
      final api = ref.read(settingsApiProvider);
      await api.revokeAllSessions();

      if (!ref.mounted) return;
      state = const RevokeAllSessionsSuccess();
    } on DioException catch (e) {
      if (!ref.mounted) return;
      state = RevokeAllSessionsError(message: _extractErrorMessage(e));
    } catch (e) {
      if (!ref.mounted) return;
      state = RevokeAllSessionsError(message: e.toString());
    }
  }

  /// 重置为空闲状态
  void reset() {
    state = const RevokeAllSessionsIdle();
  }
}

/// 注销所有会话 Provider
final revokeAllSessionsProvider =
    NotifierProvider<RevokeAllSessionsNotifier, RevokeAllSessionsState>(
      RevokeAllSessionsNotifier.new,
    );
