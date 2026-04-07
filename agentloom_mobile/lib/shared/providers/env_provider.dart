import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../config/env.dart';
import 'secure_storage_provider.dart';

/// 运行时连接配置存储 key
class RuntimeEnvStorageKeys {
  RuntimeEnvStorageKeys._();

  static const studioBaseUrl = 'agentloom_runtime_studio_base_url';
}

/// 运行时连接配置持久化
class RuntimeEnvStorage {
  RuntimeEnvStorage(this._storage);

  final FlutterSecureStorage _storage;

  Future<String?> readStudioBaseUrl() async {
    try {
      return await _storage.read(key: RuntimeEnvStorageKeys.studioBaseUrl);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveStudioBaseUrl(String studioBaseUrl) async {
    await _storage.write(
      key: RuntimeEnvStorageKeys.studioBaseUrl,
      value: studioBaseUrl,
    );
  }

  Future<void> clearStudioBaseUrl() async {
    try {
      await _storage.delete(key: RuntimeEnvStorageKeys.studioBaseUrl);
    } catch (_) {
      // Web 端本地加密状态损坏时，清理失败不应阻断用户回退到默认地址。
    }
  }
}

/// 启动阶段注入的默认环境配置
final baseEnvProvider = Provider<EnvConfig>((ref) {
  return const EnvConfig(
    studioBaseUrl: 'https://agentloom.ling.plus',
    appName: 'AgentLoom Dev',
    environment: AppEnvironment.dev,
  );
});

/// 启动阶段从持久化存储恢复的运行时覆盖地址
final runtimeStudioBaseUrlOverrideProvider = Provider<String?>((ref) => null);

/// 运行时连接配置存储 Provider
final runtimeEnvStorageProvider = Provider<RuntimeEnvStorage>((ref) {
  return RuntimeEnvStorage(ref.watch(secureStorageProvider));
});

/// 当前环境配置状态控制器
class EnvController extends Notifier<EnvConfig> {
  @override
  EnvConfig build() {
    final baseEnv = ref.watch(baseEnvProvider);
    final runtimeOverride = ref.watch(runtimeStudioBaseUrlOverrideProvider);

    if (runtimeOverride == null || runtimeOverride.isEmpty) {
      return baseEnv;
    }

    return baseEnv.copyWith(studioBaseUrl: runtimeOverride);
  }

  Future<void> updateStudioBaseUrl(String studioBaseUrl) async {
    final normalizedStudioBaseUrl = EnvConfig.normalizeStudioBaseUrl(
      studioBaseUrl,
    );

    state = state.copyWith(studioBaseUrl: normalizedStudioBaseUrl);
    await ref
        .read(runtimeEnvStorageProvider)
        .saveStudioBaseUrl(normalizedStudioBaseUrl);
  }

  Future<void> resetToDefault() async {
    final baseEnv = ref.read(baseEnvProvider);
    state = baseEnv;
    await ref.read(runtimeEnvStorageProvider).clearStudioBaseUrl();
  }
}

/// 当前环境配置 Provider
final envProvider = NotifierProvider<EnvController, EnvConfig>(
  EnvController.new,
);

/// 当前是否使用了运行时覆盖地址
final hasRuntimeEnvOverrideProvider = Provider<bool>((ref) {
  final env = ref.watch(envProvider);
  final baseEnv = ref.watch(baseEnvProvider);
  return env.studioBaseUrl != baseEnv.studioBaseUrl;
});

/// 当前连接信息的简短说明
final envSummaryProvider = Provider<String>((ref) {
  final env = ref.watch(envProvider);
  return '${env.displayHost} · ${env.environment.name}';
});
