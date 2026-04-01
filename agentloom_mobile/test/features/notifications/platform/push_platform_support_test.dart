import 'package:agentloom_mobile/features/notifications/platform/push_platform_support.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PushPlatformSupport', () {
    test('Web 平台禁用推送能力', () {
      const support = PushPlatformSupport(
        isWeb: true,
        targetPlatform: TargetPlatform.android,
      );

      expect(support.isSupported, isFalse);
      expect(support.usesAndroidNotificationChannel, isFalse);
    });

    test('Android 平台启用推送能力并使用通知渠道', () {
      const support = PushPlatformSupport(
        isWeb: false,
        targetPlatform: TargetPlatform.android,
      );

      expect(support.isSupported, isTrue);
      expect(support.usesAndroidNotificationChannel, isTrue);
      expect(support.registrationPlatform, 'android');
    });

    test('iOS 平台启用推送能力并使用 ios 注册标识', () {
      const support = PushPlatformSupport(
        isWeb: false,
        targetPlatform: TargetPlatform.iOS,
      );

      expect(support.isSupported, isTrue);
      expect(support.usesAndroidNotificationChannel, isFalse);
      expect(support.registrationPlatform, 'ios');
    });
  });
}
