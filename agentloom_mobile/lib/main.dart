import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app/app.dart';
import 'config/env.dart';
import 'features/auth/providers/token_storage_provider.dart';
import 'shared/providers/env_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 加载环境配置
  // 默认加载 dev 环境，可通过编译时参数切换
  const envName = String.fromEnvironment('ENV', defaultValue: 'dev');

  // 先校验环境名称，未知值回退为 dev，再加载对应 dotenv 文件
  final environment = AppEnvironment.fromString(envName);
  await dotenv.load(fileName: '.env.${environment.name}');
  final envConfig = EnvConfig.fromDotEnv(environment: environment);

  // TODO(fcm): Story 7.6 在此处初始化 FCM

  runApp(
    ProviderScope(
      overrides: [
        envProvider.overrideWithValue(envConfig),
        // 显式提供 FlutterSecureStorage 实例，确保测试中可 mock
        secureStorageProvider.overrideWithValue(const FlutterSecureStorage()),
      ],
      child: const AgentLoomApp(),
    ),
  );
}
