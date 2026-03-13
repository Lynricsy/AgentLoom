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

  @override
  Future<PushNotificationState> build() async {
    ref.onDispose(() => unawaited(_tokenRefreshSub?.cancel()));
    return const PushNotificationState();
  }

  Future<void> initializeAfterAuth() async {
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

    final token = service.lastRegisteredToken;
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

    if (!ref.mounted) {
      return;
    }

    state = const AsyncData(PushNotificationState());
  }
}
