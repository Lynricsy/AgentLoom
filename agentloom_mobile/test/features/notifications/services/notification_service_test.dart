import 'package:agentloom_mobile/features/notifications/models/push_notification_payload.dart';
import 'package:agentloom_mobile/features/notifications/services/notification_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockFirebaseMessaging extends Mock implements FirebaseMessaging {}

class MockFlutterLocalNotificationsPlugin extends Mock
    implements FlutterLocalNotificationsPlugin {}

void main() {
  late MockFirebaseMessaging mockMessaging;
  late MockFlutterLocalNotificationsPlugin mockLocalNotifications;
  late NotificationService service;

  setUpAll(() {
    registerFallbackValue(const NotificationDetails());
  });

  setUp(() {
    mockMessaging = MockFirebaseMessaging();
    mockLocalNotifications = MockFlutterLocalNotificationsPlugin();
    service = NotificationService(
      messaging: mockMessaging,
      localNotifications: mockLocalNotifications,
      onMessageStream: const Stream.empty(),
      onMessageOpenedAppStream: const Stream.empty(),
    );
  });

  NotificationSettings createSettings(AuthorizationStatus status) {
    return NotificationSettings(
      alert: AppleNotificationSetting.notSupported,
      announcement: AppleNotificationSetting.notSupported,
      authorizationStatus: status,
      badge: AppleNotificationSetting.notSupported,
      carPlay: AppleNotificationSetting.notSupported,
      lockScreen: AppleNotificationSetting.notSupported,
      notificationCenter: AppleNotificationSetting.notSupported,
      showPreviews: AppleShowPreviewSetting.notSupported,
      timeSensitive: AppleNotificationSetting.notSupported,
      criticalAlert: AppleNotificationSetting.notSupported,
      sound: AppleNotificationSetting.notSupported,
      providesAppNotificationSettings: AppleNotificationSetting.notSupported,
    );
  }

  group('requestPermission', () {
    test('authorized 返回 true', () async {
      when(
        () => mockMessaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        ),
      ).thenAnswer((_) async => createSettings(AuthorizationStatus.authorized));

      await expectLater(service.requestPermission(), completion(isTrue));
    });

    test('denied 返回 false', () async {
      when(
        () => mockMessaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        ),
      ).thenAnswer((_) async => createSettings(AuthorizationStatus.denied));

      await expectLater(service.requestPermission(), completion(isFalse));
    });

    test('provisional 返回 true', () async {
      when(
        () => mockMessaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        ),
      ).thenAnswer(
        (_) async => createSettings(AuthorizationStatus.provisional),
      );

      await expectLater(service.requestPermission(), completion(isTrue));
    });
  });

  test('getToken 返回 token', () async {
    when(() => mockMessaging.getToken()).thenAnswer((_) async => 'fcm-token-1');

    await expectLater(service.getToken(), completion('fcm-token-1'));
  });

  test('deleteToken 会清空 lastRegisteredToken', () async {
    when(() => mockMessaging.deleteToken()).thenAnswer((_) async {});
    service.lastRegisteredToken = 'fcm-token-2';

    await service.deleteToken();

    expect(service.lastRegisteredToken, isNull);
    verify(() => mockMessaging.deleteToken()).called(1);
  });

  test('lastRegisteredToken getter/setter 正常工作', () {
    service.lastRegisteredToken = 'cached-token';

    expect(service.lastRegisteredToken, 'cached-token');
  });

  test('onNotificationTap 在系统通知点击时发出 payload', () async {
    final expectation = expectLater(
      service.onNotificationTap,
      emits(
        isA<PushNotificationPayload>()
            .having((payload) => payload.type, 'type', 'execution_completed')
            .having((payload) => payload.executionId, 'executionId', 'exec-1'),
      ),
    );

    service.handleNotificationTapForTest(
      const RemoteMessage(
        data: {'type': 'execution_completed', 'executionId': 'exec-1'},
      ),
    );

    await expectation;
  });

  group('handleLocalNotificationTapForTest', () {
    test('有效 payload 时发出 execution_completed 事件', () async {
      final events = <PushNotificationPayload>[];
      final subscription = service.onNotificationTap.listen(events.add);
      addTearDown(subscription.cancel);

      service.handleLocalNotificationTapForTest(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotification,
          payload: 'exec-local-1',
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(events, hasLength(1));
      expect(events.single.type, 'execution_completed');
      expect(events.single.executionId, 'exec-local-1');
    });

    test('空 payload 时不发出事件', () async {
      final events = <PushNotificationPayload>[];
      final subscription = service.onNotificationTap.listen(events.add);
      addTearDown(subscription.cancel);

      service.handleLocalNotificationTapForTest(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotification,
          payload: '',
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(events, isEmpty);
    });

    test('null payload 时不发出事件', () async {
      final events = <PushNotificationPayload>[];
      final subscription = service.onNotificationTap.listen(events.add);
      addTearDown(subscription.cancel);

      service.handleLocalNotificationTapForTest(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotification,
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(events, isEmpty);
    });
  });

  group('handleForegroundMessageForTest', () {
    test('有 notification 时展示本地通知', () async {
      when(
        () => mockLocalNotifications.show(
          any(),
          any(),
          any(),
          any(),
          payload: any(named: 'payload'),
        ),
      ).thenAnswer((_) async {});

      service.handleForegroundMessageForTest(
        const RemoteMessage(
          data: {'executionId': 'exec-foreground-1'},
          notification: RemoteNotification(
            title: 'Workflow done',
            body: 'Execution completed',
          ),
        ),
      );
      await Future<void>.delayed(Duration.zero);

      verify(
        () => mockLocalNotifications.show(
          any(),
          'Workflow done',
          'Execution completed',
          any(),
          payload: 'exec-foreground-1',
        ),
      ).called(1);
    });

    test('无 notification 时不展示本地通知', () async {
      service.handleForegroundMessageForTest(
        const RemoteMessage(data: {'executionId': 'exec-foreground-2'}),
      );

      verifyNever(
        () => mockLocalNotifications.show(
          any(),
          any(),
          any(),
          any(),
          payload: any(named: 'payload'),
        ),
      );
    });
  });

  test('dispose 会关闭 onNotificationTap stream', () async {
    final doneExpectation = expectLater(service.onNotificationTap, emitsDone);

    service.dispose();

    await doneExpectation;
  });
}
