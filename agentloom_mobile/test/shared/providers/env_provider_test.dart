import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockFlutterSecureStorage mockStorage;
  late RuntimeEnvStorage runtimeEnvStorage;

  setUp(() {
    mockStorage = MockFlutterSecureStorage();
    runtimeEnvStorage = RuntimeEnvStorage(mockStorage);
  });

  test('readStudioBaseUrl 在 storage 读取失败时返回 null', () async {
    when(
      () => mockStorage.read(key: RuntimeEnvStorageKeys.studioBaseUrl),
    ).thenThrow(Exception('storage-broken'));

    final result = await runtimeEnvStorage.readStudioBaseUrl();

    expect(result, isNull);
  });

  test('clearStudioBaseUrl 在 storage 删除失败时不抛错', () async {
    when(
      () => mockStorage.delete(key: RuntimeEnvStorageKeys.studioBaseUrl),
    ).thenThrow(Exception('delete-failed'));

    await expectLater(runtimeEnvStorage.clearStudioBaseUrl(), completes);
  });

  test('envProvider 应区分默认地址与运行时覆盖，并允许恢复默认地址', () async {
    when(
      () => mockStorage.delete(key: RuntimeEnvStorageKeys.studioBaseUrl),
    ).thenAnswer((_) async {});

    final container = ProviderContainer(
      overrides: [
        baseEnvProvider.overrideWithValue(
          const EnvConfig(
            studioBaseUrl: 'https://agentloom.ling.plus',
            appName: 'AgentLoom',
            environment: AppEnvironment.prod,
          ),
        ),
        runtimeStudioBaseUrlOverrideProvider.overrideWithValue(
          'https://api.agentloom.com',
        ),
        runtimeEnvStorageProvider.overrideWithValue(RuntimeEnvStorage(mockStorage)),
      ],
    );
    addTearDown(container.dispose);

    expect(
      container.read(envProvider).studioBaseUrl,
      'https://api.agentloom.com',
    );
    expect(container.read(hasRuntimeEnvOverrideProvider), isTrue);

    await container.read(envProvider.notifier).resetToDefault();

    expect(
      container.read(envProvider).studioBaseUrl,
      'https://agentloom.ling.plus',
    );
    expect(container.read(hasRuntimeEnvOverrideProvider), isFalse);
    verify(
      () => mockStorage.delete(key: RuntimeEnvStorageKeys.studioBaseUrl),
    ).called(1);
  });
}
