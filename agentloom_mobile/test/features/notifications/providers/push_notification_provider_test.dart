import 'dart:async';

import 'package:agentloom_mobile/features/notifications/api/device_api.dart';
import 'package:agentloom_mobile/features/notifications/platform/push_platform_support.dart';
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

  test('initializeAfterAuth: Web 不支持推送时直接降级为 no-op', () async {
    final webContainer = ProviderContainer(
      overrides: [
        notificationServiceProvider.overrideWithValue(fakeNotificationService),
        deviceApiProvider.overrideWithValue(fakeDeviceApi),
        pushPlatformSupportProvider.overrideWithValue(
          const PushPlatformSupport(isWeb: true),
        ),
      ],
    );
    addTearDown(webContainer.dispose);
    await webContainer.read(pushNotificationProvider.future);

    await webContainer
        .read(pushNotificationProvider.notifier)
        .initializeAfterAuth();

    expect(fakeNotificationService.initializeCalled, isFalse);
    expect(fakeDeviceApi.registerRequests, isEmpty);
    expect(
      webContainer.read(pushNotificationProvider).value,
      const PushNotificationState(),
    );
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

  // ========== Fix #1: 幂等性测试 ==========

  test('initializeAfterAuth: 并发调用只触发一次注册（幂等）', () async {
    fakeNotificationService.permissionGranted = true;
    fakeNotificationService.token = 'token-once';

    final notifier = container.read(pushNotificationProvider.notifier);

    // 同时发起两次初始化
    final future1 = notifier.initializeAfterAuth();
    final future2 = notifier.initializeAfterAuth();

    await Future.wait([future1, future2]);

    // 只应该注册一次
    expect(fakeDeviceApi.registerRequests, hasLength(1));
    expect(fakeDeviceApi.registerRequests.single.deviceToken, 'token-once');
  });

  test('initializeAfterAuth: 三次并发调用仍只注册一次', () async {
    fakeNotificationService.permissionGranted = true;
    fakeNotificationService.token = 'token-triple';

    final notifier = container.read(pushNotificationProvider.notifier);

    await Future.wait([
      notifier.initializeAfterAuth(),
      notifier.initializeAfterAuth(),
      notifier.initializeAfterAuth(),
    ]);

    expect(fakeDeviceApi.registerRequests, hasLength(1));
    expect(fakeDeviceApi.registerRequests.single.deviceToken, 'token-triple');
  });

  test('initializeAfterAuth: cleanupOnLogout 后可重新初始化', () async {
    fakeNotificationService.permissionGranted = true;
    fakeNotificationService.token = 'token-first';

    final notifier = container.read(pushNotificationProvider.notifier);

    // 第一次初始化
    await notifier.initializeAfterAuth();
    expect(fakeDeviceApi.registerRequests, hasLength(1));

    // 登出重置
    await notifier.cleanupOnLogout();

    // 第二次初始化（新 token）
    fakeNotificationService.token = 'token-second';
    fakeNotificationService.initializeCalled = false;
    await notifier.initializeAfterAuth();

    expect(fakeDeviceApi.registerRequests, hasLength(2));
    expect(fakeDeviceApi.registerRequests[1].deviceToken, 'token-second');
  });

  test('initializeAfterAuth: 初始化失败后 cleanupOnLogout 仍可重置幂等锁', () async {
    fakeNotificationService.initializeError = Exception('init fail');

    final notifier = container.read(pushNotificationProvider.notifier);

    // 失败的初始化
    await notifier.initializeAfterAuth();
    final errorState = container.read(pushNotificationProvider).value;
    expect(errorState?.status, PushNotificationStatus.error);

    // 登出重置
    await notifier.cleanupOnLogout();

    // 修复问题后重新初始化
    fakeNotificationService.initializeError = null;
    fakeNotificationService.permissionGranted = true;
    fakeNotificationService.token = 'token-retry';
    await notifier.initializeAfterAuth();

    expect(fakeDeviceApi.registerRequests, hasLength(1));
    expect(fakeDeviceApi.registerRequests.single.deviceToken, 'token-retry');
    final state = container.read(pushNotificationProvider).value;
    expect(state?.status, PushNotificationStatus.registered);
  });

  // ========== Fix #2: 冷启动 token 回退测试 ==========

  test('cleanupOnLogout: lastRegisteredToken 为空时回退到 getToken() 注销', () async {
    // 模拟冷启动场景：内存缓存为空，但 FCM 有 token
    fakeNotificationService.lastRegisteredToken = null;
    fakeNotificationService.token = 'token-from-fcm';

    await container.read(pushNotificationProvider.notifier).cleanupOnLogout();

    // 应该使用 getToken() 返回的 token 发起注销
    expect(fakeDeviceApi.unregisterRequests, ['token-from-fcm']);
    expect(fakeNotificationService.deleteTokenCalled, isTrue);
  });

  test('cleanupOnLogout: lastRegisteredToken 和 getToken() 都为空时跳过注销', () async {
    fakeNotificationService.lastRegisteredToken = null;
    fakeNotificationService.token = null;

    await container.read(pushNotificationProvider.notifier).cleanupOnLogout();

    // 没有 token 可用，不应调用 unregister
    expect(fakeDeviceApi.unregisterRequests, isEmpty);
    // 但 deleteToken 仍应被调用以清理本地
    expect(fakeNotificationService.deleteTokenCalled, isTrue);
  });

  test(
    'cleanupOnLogout: lastRegisteredToken 为空且 getToken() 抛异常时仍完成清理',
    () async {
      fakeNotificationService.lastRegisteredToken = null;
      fakeNotificationService.tokenError = Exception('fcm unavailable');

      await expectLater(
        container.read(pushNotificationProvider.notifier).cleanupOnLogout(),
        completes,
      );

      // getToken() 失败 → 无 token 可用 → 跳过 unregister
      expect(fakeDeviceApi.unregisterRequests, isEmpty);
      // deleteToken 仍然调用
      expect(fakeNotificationService.deleteTokenCalled, isTrue);
      // 状态已重置
      expect(
        container.read(pushNotificationProvider).value,
        const PushNotificationState(),
      );
    },
  );

  test('cleanupOnLogout: 优先使用 lastRegisteredToken 而非 getToken()', () async {
    // 两者都有值时，应使用缓存的 lastRegisteredToken
    fakeNotificationService.lastRegisteredToken = 'cached-token';
    fakeNotificationService.token = 'fcm-fresh-token';

    await container.read(pushNotificationProvider.notifier).cleanupOnLogout();

    expect(fakeDeviceApi.unregisterRequests, ['cached-token']);
  });
}
