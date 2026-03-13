import 'package:freezed_annotation/freezed_annotation.dart';

import 'auth_tokens.dart';
import 'login_user.dart';

part 'auth_state.freezed.dart';

/// 认证状态 — 密封联合类型
@freezed
sealed class AuthState with _$AuthState {
  const factory AuthState.initial() = AuthStateInitial;
  const factory AuthState.authenticated({
    required LoginUser user,
    required AuthTokens tokens,
  }) = AuthStateAuthenticated;
  const factory AuthState.unauthenticated({String? message}) =
      AuthStateUnauthenticated;
  const factory AuthState.mfaRequired({
    required String mfaToken,
    required List<Map<String, dynamic>> factors,
  }) = AuthStateMfaRequired;
}
