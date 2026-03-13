import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late MockFlutterSecureStorage mockStorage;
  late TokenStorage tokenStorage;

  setUp(() {
    mockStorage = MockFlutterSecureStorage();
    tokenStorage = TokenStorage(mockStorage);

    when(
      () => mockStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => mockStorage.delete(key: any(named: 'key')),
    ).thenAnswer((_) async {});
  });

  group('TokenStorage', () {
    final tokens = AuthTokens(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    );

    test('saveTokens 写入全部 3 个 key', () async {
      await tokenStorage.saveTokens(tokens);

      verify(
        () => mockStorage.write(
          key: TokenStorageKeys.accessToken,
          value: 'access-token',
        ),
      ).called(1);
      verify(
        () => mockStorage.write(
          key: TokenStorageKeys.refreshToken,
          value: 'refresh-token',
        ),
      ).called(1);
      verify(
        () => mockStorage.write(
          key: TokenStorageKeys.tokenExpiresIn,
          value: '3600',
        ),
      ).called(1);
    });

    test('readTokens 在全部 key 存在时返回 AuthTokens', () async {
      when(
        () => mockStorage.read(key: TokenStorageKeys.accessToken),
      ).thenAnswer((_) async => 'access-token');
      when(
        () => mockStorage.read(key: TokenStorageKeys.refreshToken),
      ).thenAnswer((_) async => 'refresh-token');
      when(
        () => mockStorage.read(key: TokenStorageKeys.tokenExpiresIn),
      ).thenAnswer((_) async => '3600');

      final result = await tokenStorage.readTokens();

      expect(result, equals(tokens));
    });

    test('readTokens 任一 key 缺失时返回 null', () async {
      when(
        () => mockStorage.read(key: TokenStorageKeys.accessToken),
      ).thenAnswer((_) async => 'access-token');
      when(
        () => mockStorage.read(key: TokenStorageKeys.refreshToken),
      ).thenAnswer((_) async => null);
      when(
        () => mockStorage.read(key: TokenStorageKeys.tokenExpiresIn),
      ).thenAnswer((_) async => '3600');

      final result = await tokenStorage.readTokens();

      expect(result, isNull);
    });

    test('hasTokens 在 access_token 存在时返回 true', () async {
      when(
        () => mockStorage.read(key: TokenStorageKeys.accessToken),
      ).thenAnswer((_) async => 'access-token');

      final result = await tokenStorage.hasTokens();

      expect(result, isTrue);
    });

    test('hasTokens 在 access_token 缺失时返回 false', () async {
      when(
        () => mockStorage.read(key: TokenStorageKeys.accessToken),
      ).thenAnswer((_) async => null);

      final result = await tokenStorage.hasTokens();

      expect(result, isFalse);
    });

    test('clearTokens 删除全部 3 个 key', () async {
      await tokenStorage.clearTokens();

      verify(
        () => mockStorage.delete(key: TokenStorageKeys.accessToken),
      ).called(1);
      verify(
        () => mockStorage.delete(key: TokenStorageKeys.refreshToken),
      ).called(1);
      verify(
        () => mockStorage.delete(key: TokenStorageKeys.tokenExpiresIn),
      ).called(1);
    });
  });
}
