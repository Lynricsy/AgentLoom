import 'package:agentloom_mobile/shared/providers/env_provider.dart';
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
}
