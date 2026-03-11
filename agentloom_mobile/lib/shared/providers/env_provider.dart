import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/env.dart';

/// 当前环境配置 Provider
///
/// 在 main.dart 中通过 ProviderScope overrides 初始化。
final envProvider = Provider<EnvConfig>((ref) {
  // 默认 dev 环境；main.dart 中会 override
  return const EnvConfig(
    apiBaseUrl: 'http://localhost:3000/api/v1',
    appName: 'AgentLoom Dev',
    environment: AppEnvironment.dev,
  );
});
