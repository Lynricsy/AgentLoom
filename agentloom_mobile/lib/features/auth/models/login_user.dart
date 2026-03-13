import 'package:freezed_annotation/freezed_annotation.dart';

part 'login_user.freezed.dart';
part 'login_user.g.dart';

/// 登录用户信息
@freezed
abstract class LoginUser with _$LoginUser {
  const factory LoginUser({
    required String id,
    required String email,
    @JsonKey(name: 'display_name') String? displayName,
  }) = _LoginUser;

  factory LoginUser.fromJson(Map<String, dynamic> json) =>
      _$LoginUserFromJson(json);
}
