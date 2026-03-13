import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../models/push_notification_payload.dart';

class NotificationService {
  NotificationService({
    FirebaseMessaging? messaging,
    FlutterLocalNotificationsPlugin? localNotifications,
    Stream<RemoteMessage>? onMessageStream,
    Stream<RemoteMessage>? onMessageOpenedAppStream,
  }) : _messagingOverride = messaging,
       _localNotifications =
           localNotifications ?? FlutterLocalNotificationsPlugin(),
       _onMessageStreamOverride = onMessageStream,
       _onMessageOpenedAppStreamOverride = onMessageOpenedAppStream;

  FirebaseMessaging? _messagingOverride;
  final FlutterLocalNotificationsPlugin _localNotifications;
  final Stream<RemoteMessage>? _onMessageStreamOverride;
  final Stream<RemoteMessage>? _onMessageOpenedAppStreamOverride;

  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;
  StreamSubscription<RemoteMessage>? _messageOpenedAppSubscription;
  String? lastRegisteredToken;
  bool _isInitialized = false;
  bool _isDisposed = false;

  final StreamController<PushNotificationPayload> _notificationTapController =
      StreamController<PushNotificationPayload>.broadcast();

  FirebaseMessaging get _messaging =>
      _messagingOverride ??= FirebaseMessaging.instance;

  Stream<RemoteMessage> get _onMessageStream =>
      _onMessageStreamOverride ?? FirebaseMessaging.onMessage;

  Stream<RemoteMessage> get _onMessageOpenedAppStream =>
      _onMessageOpenedAppStreamOverride ?? FirebaseMessaging.onMessageOpenedApp;

  Stream<PushNotificationPayload> get onNotificationTap =>
      _notificationTapController.stream;

  Future<void> initialize() async {
    if (_isInitialized) {
      return;
    }

    try {
      const androidSettings = AndroidInitializationSettings(
        '@mipmap/ic_launcher',
      );
      const iosSettings = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      await _localNotifications.initialize(
        const InitializationSettings(
          android: androidSettings,
          iOS: iosSettings,
        ),
        onDidReceiveNotificationResponse: _onLocalNotificationTap,
      );

      if (Platform.isAndroid) {
        await _localNotifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.createNotificationChannel(
              const AndroidNotificationChannel(
                'agentloom_executions',
                'Workflow Executions',
                description: 'Workflow execution status notifications',
                importance: Importance.high,
              ),
            );
      }

      _foregroundMessageSubscription = _onMessageStream.listen(
        _handleForegroundMessage,
      );
      _messageOpenedAppSubscription = _onMessageOpenedAppStream.listen(
        _handleNotificationTap,
      );

      final initialMessage = await _messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }

      _isInitialized = true;
    } catch (_) {
      await _foregroundMessageSubscription?.cancel();
      await _messageOpenedAppSubscription?.cancel();
      _foregroundMessageSubscription = null;
      _messageOpenedAppSubscription = null;
      rethrow;
    }
  }

  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  Future<String?> getToken() async {
    return _messaging.getToken();
  }

  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  Future<void> deleteToken() async {
    await _messaging.deleteToken();
    lastRegisteredToken = null;
  }

  /// 仅供测试调用：模拟前台收到推送。
  void handleForegroundMessageForTest(RemoteMessage message) {
    _handleForegroundMessage(message);
  }

  /// 仅供测试调用：模拟点击系统推送打开应用。
  void handleNotificationTapForTest(RemoteMessage message) {
    _handleNotificationTap(message);
  }

  /// 仅供测试调用：模拟点击本地通知。
  void handleLocalNotificationTapForTest(NotificationResponse response) {
    _onLocalNotificationTap(response);
  }

  void _handleForegroundMessage(RemoteMessage message) {
    if (_isDisposed) {
      return;
    }

    final notification = message.notification;
    if (notification == null) {
      return;
    }

    unawaited(
      _localNotifications.show(
        message.hashCode,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'agentloom_executions',
            'Workflow Executions',
            channelDescription: 'Workflow execution status notifications',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: message.data['executionId']?.toString(),
      ),
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    if (_isDisposed) {
      return;
    }

    final payload = PushNotificationPayload.fromFcmData(message.data);
    _notificationTapController.add(payload);
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    if (_isDisposed) {
      return;
    }

    final executionId = response.payload;
    if (executionId == null || executionId.isEmpty) {
      return;
    }

    _notificationTapController.add(
      PushNotificationPayload(
        type: 'execution_completed',
        executionId: executionId,
      ),
    );
  }

  void dispose() {
    if (_isDisposed) {
      return;
    }

    _isDisposed = true;
    unawaited(_foregroundMessageSubscription?.cancel());
    unawaited(_messageOpenedAppSubscription?.cancel());
    _foregroundMessageSubscription = null;
    _messageOpenedAppSubscription = null;
    _isInitialized = false;
    _notificationTapController.close();
  }
}
