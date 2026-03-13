// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'login_user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_LoginUser _$LoginUserFromJson(Map<String, dynamic> json) => _LoginUser(
  id: json['id'] as String,
  email: json['email'] as String,
  displayName: json['display_name'] as String?,
);

Map<String, dynamic> _$LoginUserToJson(_LoginUser instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'display_name': instance.displayName,
    };
