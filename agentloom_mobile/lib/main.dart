import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'config/env.dart';
import 'shared/providers/env_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 加载环境配置
  // 默认加载 dev 环境，可通过编译时参数切换
  const envName = String.fromEnvironment('ENV', defaultValue: 'dev');
  await dotenv.load(fileName: '.env.$envName');

  final environment = AppEnvironment.fromString(envName);
  final envConfig = EnvConfig.fromDotEnv(environment: environment);

  // TODO(fcm): Story 7.6 在此处初始化 FCM

  runApp(
    ProviderScope(
      overrides: [envProvider.overrideWithValue(envConfig)],
      child: const AgentLoomApp(),
    ),
  );
}
