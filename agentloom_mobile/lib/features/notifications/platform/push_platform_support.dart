import 'package:flutter/foundation.dart';

/// 推送能力探测：集中判断当前平台是否应该启用 Firebase Push。
class PushPlatformSupport {
  const PushPlatformSupport({bool? isWeb, TargetPlatform? targetPlatform})
    : _isWebOverride = isWeb,
      _targetPlatformOverride = targetPlatform;

  final bool? _isWebOverride;
  final TargetPlatform? _targetPlatformOverride;

  bool get isWeb => _isWebOverride ?? kIsWeb;

  TargetPlatform get targetPlatform =>
      _targetPlatformOverride ?? defaultTargetPlatform;

  bool get isSupported {
    if (isWeb) {
      return false;
    }

    return targetPlatform == TargetPlatform.android ||
        targetPlatform == TargetPlatform.iOS;
  }

  bool get usesAndroidNotificationChannel =>
      !isWeb && targetPlatform == TargetPlatform.android;

  String get registrationPlatform =>
      targetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}
