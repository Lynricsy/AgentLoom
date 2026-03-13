import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/device_api.dart';
import '../services/notification_service.dart';

enum PushNotificationStatus {
  uninitialized,
  permissionDenied,
  registered,
  error,
}

class PushNotificationState {
  const PushNotificationState({
    this.status = PushNotificationStatus.uninitialized,
    this.errorMessage,
  });

  final PushNotificationStatus status;
  final String? errorMessage;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PushNotificationState &&
          runtimeType == other.runtimeType &&
          status == other.status &&
          errorMessage == other.errorMessage;

  @override
  int get hashCode => Object.hash(status, errorMessage);
}

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = NotificationService();
  ref.onDispose(service.dispose);
  return service;
});

final pushNotificationProvider =
    AsyncNotifierProvider<PushNotificationNotifier, PushNotificationState>(
      PushNotificationNotifier.new,
    );

class PushNotificationNotifier extends AsyncNotifier<PushNotificationState> {
  StreamSubscription<String>? _tokenRefreshSub;

  /// 幂等锁：防止并发调用 initializeAfterAuth() 导致重复注册与多个 listener。
  Completer<void>? _initCompleter;

  @override
  Future<PushNotificationState> build() async {
    ref.onDispose(() => unawaited(_tokenRefreshSub?.cancel()));
    return const PushNotificationState();
  }

  /// 在认证成功后调用。幂等：多次并发调用只会执行一次，后续调用复用同一 Future。
  Future<void> initializeAfterAuth() async {
    if (_initCompleter != null) {
      // 已有初始化在进行中或已完成，等待结果即可。
      return _initCompleter!.future;
    }

    _initCompleter = Completer<void>();
    try {
      await _doInitialize();
      _initCompleter!.complete();
    } catch (e) {
      _initCompleter!.complete(); // 标记完成（非抛异常），避免后续调用者拿到错误
    }
  }

  Future<void> _doInitialize() async {
    final service = ref.read(notificationServiceProvider);
    final deviceApi = ref.read(deviceApiProvider);

    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;

    try {
      await service.initialize();

      final granted = await service.requestPermission();
      if (!ref.mounted) {
        return;
      }

      if (!granted) {
        state = const AsyncData(
          PushNotificationState(
            status: PushNotificationStatus.permissionDenied,
          ),
        );
        return;
      }

      final token = await service.getToken();
      if (token != null && token != service.lastRegisteredToken) {
        final platform = Platform.isIOS ? 'ios' : 'android';
        await deviceApi.registerDevice(deviceToken: token, platform: platform);
        service.lastRegisteredToken = token;
      }

      _tokenRefreshSub = service.onTokenRefresh.listen((newToken) async {
        if (newToken == service.lastRegisteredToken) {
          return;
        }

        try {
          final platform = Platform.isIOS ? 'ios' : 'android';
          await deviceApi.registerDevice(
            deviceToken: newToken,
            platform: platform,
          );
          service.lastRegisteredToken = newToken;
        } catch (e) {
          if (!ref.mounted) {
            return;
          }

          state = AsyncData(
            PushNotificationState(
              status: PushNotificationStatus.error,
              errorMessage: e.toString(),
            ),
          );
        }
      });

      if (!ref.mounted) {
        return;
      }

      state = const AsyncData(
        PushNotificationState(status: PushNotificationStatus.registered),
      );
    } catch (e) {
      if (!ref.mounted) {
        return;
      }

      state = AsyncData(
        PushNotificationState(
          status: PushNotificationStatus.error,
          errorMessage: e.toString(),
        ),
      );
    }
  }

  Future<void> cleanupOnLogout() async {
    final service = ref.read(notificationServiceProvider);
    final deviceApi = ref.read(deviceApiProvider);

    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;

    // 优先使用内存缓存的 token；若缓存为空（冷启动恢复场景），回退到 FCM getToken()。
    var token = service.lastRegisteredToken;
    if (token == null) {
      try {
        token = await service.getToken();
      } catch (_) {
        // FCM getToken() 失败时继续走后续清理。
      }
    }

    if (token != null) {
      try {
        await deviceApi.unregisterDevice(deviceToken: token);
      } catch (_) {
        // 设备注销失败不应阻塞登出流程。
      }
    }

    try {
      await service.deleteToken();
    } catch (_) {
      // 删除 FCM token 失败时也不阻塞登出。
    }

    // 重置幂等锁，以便重新登录后能再次初始化推送。
    _initCompleter = null;

    if (!ref.mounted) {
      return;
    }

    state = const AsyncData(PushNotificationState());
  }
}
