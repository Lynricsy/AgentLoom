import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'app/app.dart';
import 'config/env.dart';
import 'features/notifications/platform/push_platform_support.dart';
import 'shared/providers/env_provider.dart';
import 'shared/providers/secure_storage_provider.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase 未配置时直接忽略后台推送初始化。
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 加载环境配置
  // 默认加载 dev 环境，可通过编译时参数切换
  const envName = String.fromEnvironment('ENV', defaultValue: 'dev');

  // 先校验环境名称，未知值回退为 dev，再加载对应 dotenv 文件
  final environment = AppEnvironment.fromString(envName);
  await dotenv.load(fileName: '.env.${environment.name}');
  const secureStorage = FlutterSecureStorage();
  final bootstrapEnvConfig = EnvConfig.fromDotEnv(environment: environment);
  final runtimeEnvStorage = RuntimeEnvStorage(secureStorage);
  final savedStudioBaseUrl = await runtimeEnvStorage.readStudioBaseUrl();
  final resolvedEnvConfig = savedStudioBaseUrl == null
      ? bootstrapEnvConfig
      : bootstrapEnvConfig.copyWith(studioBaseUrl: savedStudioBaseUrl);
  const pushPlatformSupport = PushPlatformSupport();

  if (pushPlatformSupport.isSupported) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );
    } catch (_) {
      // Firebase 未配置时允许应用继续启动，推送功能保持禁用。
    }
  }

  runApp(
    ProviderScope(
      overrides: [
        baseEnvProvider.overrideWithValue(resolvedEnvConfig),
        secureStorageProvider.overrideWithValue(secureStorage),
      ],
      child: const AgentLoomApp(),
    ),
  );
}
