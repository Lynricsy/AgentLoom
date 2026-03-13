import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late MockDio mockDio;
  late AuthApi authApi;

  setUp(() {
    mockDio = MockDio();
    authApi = AuthApi(mockDio);
  });

  RequestOptions reqOpts() => RequestOptions();

  group('AuthApi.login', () {
    test('正常登录返回 AuthLoginSuccess', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/login',
          data: {'email': 'fox@test.com', 'password': 'pass123'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'user': {
                'id': 'u1',
                'email': 'fox@test.com',
                'display_name': '酒狐',
              },
              'tokens': {
                'access_token': 'at',
                'refresh_token': 'rt',
                'expires_in': 3600,
              },
            },
          },
          statusCode: 200,
          requestOptions: reqOpts(),
        ),
      );

      final result = await authApi.login('fox@test.com', 'pass123');

      expect(result, isA<AuthLoginSuccess>());
      final success = result as AuthLoginSuccess;
      expect(success.user.email, 'fox@test.com');
      expect(success.user.displayName, '酒狐');
      expect(success.tokens.accessToken, 'at');
      expect(success.tokens.refreshToken, 'rt');
      expect(success.tokens.expiresIn, 3600);
    });

    test('MFA 分支 (camelCase) 返回 AuthLoginMfaRequired', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/login',
          data: {'email': 'mfa@test.com', 'password': 'pass'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'mfaRequired': true,
              'mfaToken': 'mfa-token-123',
              'factors': [
                {'id': 'f1', 'type': 'totp'},
              ],
            },
          },
          statusCode: 200,
          requestOptions: reqOpts(),
        ),
      );

      final result = await authApi.login('mfa@test.com', 'pass');

      expect(result, isA<AuthLoginMfaRequired>());
      final mfa = result as AuthLoginMfaRequired;
      expect(mfa.mfaToken, 'mfa-token-123');
      expect(mfa.factors, hasLength(1));
      expect(mfa.factors[0]['type'], 'totp');
    });

    test('MFA 分支 (snake_case) 返回 AuthLoginMfaRequired', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/login',
          data: {'email': 'mfa@test.com', 'password': 'pass'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'mfa_required': true,
              'mfa_token': 'mfa-token-456',
              'factors': <Map<String, dynamic>>[],
            },
          },
          statusCode: 200,
          requestOptions: reqOpts(),
        ),
      );

      final result = await authApi.login('mfa@test.com', 'pass');

      expect(result, isA<AuthLoginMfaRequired>());
      final mfa = result as AuthLoginMfaRequired;
      expect(mfa.mfaToken, 'mfa-token-456');
      expect(mfa.factors, isEmpty);
    });

    test('网络错误时抛出 DioException', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/login',
          data: any(named: 'data'),
        ),
      ).thenThrow(
        DioException(
          type: DioExceptionType.connectionTimeout,
          requestOptions: reqOpts(),
        ),
      );

      expect(() => authApi.login('a@b.com', 'p'), throwsA(isA<DioException>()));
    });
  });

  group('AuthApi.register', () {
    test('注册成功返回 AuthRegisterSuccess', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/register',
          data: {
            'email': 'new@test.com',
            'password': 'pass123',
            'display_name': '狐狸',
          },
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'user': {'id': 'u2', 'email': 'new@test.com'},
              'tokens': {
                'access_token': 'at2',
                'refresh_token': 'rt2',
                'expires_in': 7200,
              },
            },
          },
          statusCode: 201,
          requestOptions: reqOpts(),
        ),
      );

      final result = await authApi.register(
        'new@test.com',
        'pass123',
        displayName: '狐狸',
      );

      expect(result, isA<AuthRegisterSuccess>());
      final success = result as AuthRegisterSuccess;
      expect(success.user.email, 'new@test.com');
      expect(success.tokens.accessToken, 'at2');
    });

    test('注册需要邮箱确认返回 AuthRegisterEmailConfirmation', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/register',
          data: {'email': 'confirm@test.com', 'password': 'pass'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {'email_confirmation_required': true},
          },
          statusCode: 200,
          requestOptions: reqOpts(),
        ),
      );

      final result = await authApi.register('confirm@test.com', 'pass');

      expect(result, isA<AuthRegisterEmailConfirmation>());
    });

    test('不传 displayName 时请求体不包含该字段', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/register',
          data: {'email': 'no-name@test.com', 'password': 'pass'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'user': {'id': 'u3', 'email': 'no-name@test.com'},
              'tokens': {
                'access_token': 'at3',
                'refresh_token': 'rt3',
                'expires_in': 3600,
              },
            },
          },
          statusCode: 201,
          requestOptions: reqOpts(),
        ),
      );

      await authApi.register('no-name@test.com', 'pass');

      final captured = verify(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/register',
          data: captureAny(named: 'data'),
        ),
      ).captured;

      final body = captured.first as Map<String, dynamic>;
      expect(body.containsKey('display_name'), isFalse);
    });
  });

  group('AuthApi.refresh', () {
    test('刷新成功返回新 AuthTokens', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refresh_token': 'old-rt'},
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'data': {
              'tokens': {
                'access_token': 'new-at',
                'refresh_token': 'new-rt',
                'expires_in': 3600,
              },
            },
          },
          statusCode: 200,
          requestOptions: reqOpts(),
        ),
      );

      final tokens = await authApi.refresh('old-rt');

      expect(tokens, isA<AuthTokens>());
      expect(tokens.accessToken, 'new-at');
      expect(tokens.refreshToken, 'new-rt');
    });

    test('刷新失败时抛出 DioException', () async {
      when(
        () => mockDio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refresh_token': 'expired-rt'},
        ),
      ).thenThrow(
        DioException(
          type: DioExceptionType.badResponse,
          response: Response(statusCode: 401, requestOptions: reqOpts()),
          requestOptions: reqOpts(),
        ),
      );

      expect(() => authApi.refresh('expired-rt'), throwsA(isA<DioException>()));
    });
  });

  group('AuthApi.logout', () {
    test('登出发送正确的 Authorization header', () async {
      when(
        () =>
            mockDio.post<void>('/auth/logout', options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(statusCode: 204, requestOptions: reqOpts()),
      );

      await authApi.logout('my-access-token');

      final captured = verify(
        () => mockDio.post<void>(
          '/auth/logout',
          options: captureAny(named: 'options'),
        ),
      ).captured;

      final opts = captured.first as Options;
      expect(opts.headers?['Authorization'], 'Bearer my-access-token');
    });
  });
}
