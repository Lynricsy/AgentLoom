import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AuthTokens', () {
    final sampleJson = {
      'access_token': 'access-token',
      'refresh_token': 'refresh-token',
      'expires_in': 3600,
    };

    test('fromJson 正确解析 snake_case 字段', () {
      final tokens = AuthTokens.fromJson(sampleJson);

      expect(tokens.accessToken, 'access-token');
      expect(tokens.refreshToken, 'refresh-token');
      expect(tokens.expiresIn, 3600);
    });

    test('toJson 输出 snake_case 键', () {
      final tokens = AuthTokens.fromJson(sampleJson);
      final json = tokens.toJson();

      expect(json['access_token'], 'access-token');
      expect(json['refresh_token'], 'refresh-token');
      expect(json['expires_in'], 3600);
      expect(json.containsKey('accessToken'), isFalse);
    });

    test('copyWith 正确更新字段', () {
      final tokens = AuthTokens.fromJson(sampleJson);
      final copy = tokens.copyWith(expiresIn: 7200);

      expect(copy.expiresIn, 7200);
      expect(copy.accessToken, tokens.accessToken);
      expect(copy.refreshToken, tokens.refreshToken);
    });

    test('相等性比较正确', () {
      final a = AuthTokens.fromJson(sampleJson);
      final b = AuthTokens.fromJson(sampleJson);

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });
  });

  group('LoginUser', () {
    final sampleJson = {
      'id': 'user-001',
      'email': 'fox@example.com',
      'display_name': '酒狐',
    };

    test('fromJson 正确解析 display_name 字段', () {
      final user = LoginUser.fromJson(sampleJson);

      expect(user.id, 'user-001');
      expect(user.email, 'fox@example.com');
      expect(user.displayName, '酒狐');
    });

    test('toJson 输出 snake_case 键', () {
      final user = LoginUser.fromJson(sampleJson);
      final json = user.toJson();

      expect(json['display_name'], '酒狐');
      expect(json.containsKey('displayName'), isFalse);
    });

    test('copyWith 正确创建副本', () {
      final user = LoginUser.fromJson(sampleJson);
      final copy = user.copyWith(displayName: '白狐');

      expect(copy.displayName, '白狐');
      expect(copy.id, user.id);
      expect(copy.email, user.email);
    });

    test('相等性比较正确', () {
      final a = LoginUser.fromJson(sampleJson);
      final b = LoginUser.fromJson(sampleJson);

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });
  });

  group('AuthState', () {
    final user = LoginUser(
      id: 'user-001',
      email: 'fox@example.com',
      displayName: '酒狐',
    );
    final tokens = AuthTokens(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    );

    test('支持 initial 变体', () {
      const state = AuthState.initial();

      expect(state, isA<AuthStateInitial>());
    });

    test('支持 authenticated 变体', () {
      final state = AuthState.authenticated(user: user, tokens: tokens);

      expect(state, isA<AuthStateAuthenticated>());
      final authenticated = state as AuthStateAuthenticated;
      expect(authenticated.user, user);
      expect(authenticated.tokens, tokens);
    });

    test('支持 unauthenticated 变体与 message', () {
      const state = AuthState.unauthenticated(message: '登录失败');

      expect(state, isA<AuthStateUnauthenticated>());
      final unauthenticated = state as AuthStateUnauthenticated;
      expect(unauthenticated.message, '登录失败');
    });

    test('支持 mfaRequired 变体', () {
      final state = AuthState.mfaRequired(
        mfaToken: 'mfa-token',
        factors: const [
          {'id': 'factor-001', 'type': 'totp'},
        ],
      );

      expect(state, isA<AuthStateMfaRequired>());
      final mfaRequired = state as AuthStateMfaRequired;
      expect(mfaRequired.mfaToken, 'mfa-token');
      expect(mfaRequired.factors, hasLength(1));
    });

    test('authenticated 变体支持 copyWith', () {
      final state = AuthState.authenticated(user: user, tokens: tokens);
      final authenticated = state as AuthStateAuthenticated;
      final copy = authenticated.copyWith(
        tokens: tokens.copyWith(expiresIn: 7200),
      );

      expect(copy.tokens.expiresIn, 7200);
      expect(copy.user, user);
    });

    test('同一变体相等性比较正确', () {
      final a = AuthState.authenticated(user: user, tokens: tokens);
      final b = AuthState.authenticated(user: user, tokens: tokens);

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });
  });
}
