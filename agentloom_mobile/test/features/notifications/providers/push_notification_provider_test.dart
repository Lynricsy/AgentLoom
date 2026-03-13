import 'dart:async';

import 'package:agentloom_mobile/features/notifications/api/device_api.dart';
import 'package:agentloom_mobile/features/notifications/providers/push_notification_provider.dart';
import 'package:agentloom_mobile/features/notifications/services/notification_service.dart';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseMessaging extends Mock implements FirebaseMessaging {}

class MockFlutterLocalNotificationsPlugin extends Mock
    implements FlutterLocalNotificationsPlugin {}

class FakeNotificationService extends NotificationService {
  FakeNotificationService()
    : super(
        messaging: MockFirebaseMessaging(),
        localNotifications: MockFlutterLocalNotificationsPlugin(),
        onMessageStream: const Stream.empty(),
        onMessageOpenedAppStream: const Stream.empty(),
      );

  bool initializeCalled = false;
  bool permissionGranted = true;
  bool deleteTokenCalled = false;
  String? token;
  Object? initializeError;
  Object? permissionError;
  Object? tokenError;
  String? _cachedToken;

  final StreamController<String> _tokenRefreshController =
      StreamController<String>.broadcast();

  @override
  Future<void> initialize() async {
    initializeCalled = true;
    if (initializeError != null) {
      throw initializeError!;
    }
  }

  @override
  Future<bool> requestPermission() async {
    if (permissionError != null) {
      throw permissionError!;
    }

    return permissionGranted;
  }

  @override
  Future<String?> getToken() async {
    if (tokenError != null) {
      throw tokenError!;
    }

    return token;
  }

  @override
  Stream<String> get onTokenRefresh => _tokenRefreshController.stream;

  @override
  String? get lastRegisteredToken => _cachedToken;

  @override
  set lastRegisteredToken(String? token) {
    _cachedToken = token;
  }

  @override
  Future<void> deleteToken() async {
    deleteTokenCalled = true;
    _cachedToken = null;
  }

  Future<void> emitTokenRefresh(String token) async {
    _tokenRefreshController.add(token);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  @override
  void dispose() {
    _tokenRefreshController.close();
    super.dispose();
  }
}

class FakeDeviceApi extends DeviceApi {
  FakeDeviceApi() : super(Dio());

  final List<({String deviceToken, String platform})> registerRequests = [];
  final List<String> unregisterRequests = [];
  Object? registerError;
  Object? unregisterError;

  @override
  Future<void> registerDevice({
    required String deviceToken,
    required String platform,
  }) async {
    if (registerError != null) {
      throw registerError!;
    }

    registerRequests.add((deviceToken: deviceToken, platform: platform));
  }

  @override
  Future<void> unregisterDevice({required String deviceToken}) async {
    if (unregisterError != null) {
      throw unregisterError!;
    }

    unregisterRequests.add(deviceToken);
  }
}

void main() {
  late FakeNotificationService fakeNotificationService;
  late FakeDeviceApi fakeDeviceApi;
  late ProviderContainer container;

  setUp(() async {
    fakeNotificationService = FakeNotificationService();
    fakeDeviceApi = FakeDeviceApi();
    container = ProviderContainer(
      overrides: [
        notificationServiceProvider.overrideWithValue(fakeNotificationService),
        deviceApiProvider.overrideWithValue(fakeDeviceApi),
      ],
    );
    addTearDown(() {
      fakeNotificationService.dispose();
      container.dispose();
    });

    await container.read(pushNotificationProvider.future);
  });

  test('initializeAfterAuth: 授权成功后注册 token 并进入 registered', () async {
    fakeNotificationService.permissionGranted = true;
    fakeNotificationService.token = 'token-1';

    await container
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();

    final state = container.read(pushNotificationProvider).value;
    expect(state?.status, PushNotificationStatus.registered);
    expect(fakeDeviceApi.registerRequests, hasLength(1));
    expect(fakeDeviceApi.registerRequests.single.deviceToken, 'token-1');
    expect(fakeDeviceApi.registerRequests.single.platform, 'android');
    expect(fakeNotificationService.lastRegisteredToken, 'token-1');
  });

  test('initializeAfterAuth: 权限被拒绝时进入 permissionDenied', () async {
    fakeNotificationService.permissionGranted = false;

    await container
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();

    final state = container.read(pushNotificationProvider).value;
    expect(state?.status, PushNotificationStatus.permissionDenied);
    expect(fakeDeviceApi.registerRequests, isEmpty);
  });

  test('initializeAfterAuth: 异常时进入 error', () async {
    fakeNotificationService.initializeError = Exception('boom');

    await container
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();

    final state = container.read(pushNotificationProvider).value;
    expect(state?.status, PushNotificationStatus.error);
    expect(state?.errorMessage, contains('boom'));
  });

  test('token refresh 新 token 时会重新注册', () async {
    fakeNotificationService.token = 'token-1';

    await container
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();
    await fakeNotificationService.emitTokenRefresh('token-2');

    expect(fakeDeviceApi.registerRequests, hasLength(2));
    expect(fakeDeviceApi.registerRequests[0].deviceToken, 'token-1');
    expect(fakeDeviceApi.registerRequests[1].deviceToken, 'token-2');
    expect(fakeNotificationService.lastRegisteredToken, 'token-2');
  });

  test('token refresh 相同 token 时跳过重复注册', () async {
    fakeNotificationService.token = 'token-same';

    await container
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();
    await fakeNotificationService.emitTokenRefresh('token-same');

    expect(fakeDeviceApi.registerRequests, hasLength(1));
    expect(fakeDeviceApi.registerRequests.single.deviceToken, 'token-same');
  });

  test('cleanupOnLogout: 注销设备并删除本地 token', () async {
    fakeNotificationService.lastRegisteredToken = 'token-logout';

    await container.read(pushNotificationProvider.notifier).cleanupOnLogout();

    expect(fakeDeviceApi.unregisterRequests, ['token-logout']);
    expect(fakeNotificationService.deleteTokenCalled, isTrue);
    expect(fakeNotificationService.lastRegisteredToken, isNull);
    expect(
      container.read(pushNotificationProvider).value,
      const PushNotificationState(),
    );
  });

  test('cleanupOnLogout: 注销失败也不会抛异常', () async {
    fakeNotificationService.lastRegisteredToken = 'token-error';
    fakeDeviceApi.unregisterError = Exception('network fail');

    await expectLater(
      container.read(pushNotificationProvider.notifier).cleanupOnLogout(),
      completes,
    );

    expect(fakeNotificationService.deleteTokenCalled, isTrue);
    expect(
      container.read(pushNotificationProvider).value,
      const PushNotificationState(),
    );
  });
}
