import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/providers/api_client_provider.dart';

const _emptyJsonBody = <String, dynamic>{};

/// 会话信息
class SessionInfo {
  const SessionInfo({
    required this.id,
    required this.deviceInfo,
    required this.ipAddress,
    required this.lastActiveAt,
    required this.isCurrent,
    this.createdAt,
  });

  factory SessionInfo.fromJson(Map<String, dynamic> json) {
    return SessionInfo(
      id: json['id'] as String,
      deviceInfo: json['device_info'] as String? ?? '未知设备',
      ipAddress: json['ip_address'] as String? ?? '',
      lastActiveAt: json['last_active_at'] as String? ?? '',
      isCurrent: json['is_current'] as bool? ?? false,
      createdAt: json['created_at'] as String?,
    );
  }

  final String id;
  final String deviceInfo;
  final String ipAddress;
  final String lastActiveAt;
  final bool isCurrent;
  final String? createdAt;
}

/// 安全信息
class SecurityInfo {
  const SecurityInfo({
    required this.mfaEnabled,
    this.mfaType,
    this.mfaEnrolledAt,
    this.linkedProviders = const [],
  });

  factory SecurityInfo.fromJson(Map<String, dynamic> json) {
    final providers = json['linked_providers'];
    return SecurityInfo(
      mfaEnabled: json['mfa_enabled'] as bool? ?? false,
      mfaType: json['mfa_type'] as String?,
      mfaEnrolledAt: json['mfa_enrolled_at'] as String?,
      linkedProviders: providers is List
          ? providers.map((e) => e.toString()).toList()
          : const [],
    );
  }

  final bool mfaEnabled;
  final String? mfaType;
  final String? mfaEnrolledAt;

  /// 已关联的 OAuth 提供商列表（如 ['google', 'github']）
  final List<String> linkedProviders;
}

/// 用户偏好设置 DTO
class UserPreferenceDto {
  const UserPreferenceDto({required this.id, required this.titleModelConfigId});

  factory UserPreferenceDto.fromJson(Map<String, dynamic> json) {
    // 兼容 { data: {...} } 信封或直接 map
    final map = json.containsKey('data')
        ? json['data'] as Map<String, dynamic>
        : json;
    return UserPreferenceDto(
      id: map['id'] as String? ?? '',
      titleModelConfigId: map['titleModelConfigId'] as String?,
    );
  }

  final String id;
  final String? titleModelConfigId;
}

/// 设置 API 客户端
class SettingsApi {
  final Dio _dio;

  SettingsApi(this._dio);

  /// 修改密码
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _dio.patch(
      '/api/v1/auth/password',
      data: {'current_password': currentPassword, 'new_password': newPassword},
    );
  }

  /// 获取活跃会话列表
  Future<List<SessionInfo>> getSessions() async {
    final response = await _dio.get('/api/v1/auth/sessions');
    final data = response.data;

    // 兼容 { data: [...] } 和直接返回数组
    final List<dynamic> items;
    if (data is Map<String, dynamic> && data.containsKey('data')) {
      items = data['data'] as List<dynamic>;
    } else if (data is List) {
      items = data;
    } else {
      items = [];
    }

    return items
        .map((e) => SessionInfo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 注销指定会话
  Future<void> revokeSession(String sessionId) async {
    await _dio.delete('/api/v1/auth/sessions/$sessionId');
  }

  /// 获取安全信息（MFA 状态等）
  Future<SecurityInfo> getSecurityInfo() async {
    final response = await _dio.get('/api/v1/auth/security');
    final data = response.data;

    final Map<String, dynamic> info;
    if (data is Map<String, dynamic> && data.containsKey('data')) {
      info = data['data'] as Map<String, dynamic>;
    } else if (data is Map<String, dynamic>) {
      info = data;
    } else {
      info = {};
    }

    return SecurityInfo.fromJson(info);
  }

  /// 禁用 MFA
  Future<void> disableMfa(String code) async {
    await _dio.delete('/api/v1/auth/mfa', data: {'code': code});
  }

  /// 注销所有会话（当前设备除外）
  Future<void> revokeAllSessions() async {
    await _dio.post('/api/v1/auth/sessions/revoke-all', data: _emptyJsonBody);
  }

  /// 获取用户偏好设置
  Future<UserPreferenceDto> getUserPreferences() async {
    final response = await _dio.get('/api/v1/user-preferences');
    return UserPreferenceDto.fromJson(response.data as Map<String, dynamic>);
  }

  /// 更新用户偏好设置
  Future<UserPreferenceDto> updateUserPreferences({
    String? titleModelConfigId,
  }) async {
    final response = await _dio.patch(
      '/api/v1/user-preferences',
      data: {'titleModelConfigId': titleModelConfigId},
    );
    return UserPreferenceDto.fromJson(response.data as Map<String, dynamic>);
  }
}

/// Settings API Provider — 使用含 AuthInterceptor 的 Dio 实例
final settingsApiProvider = Provider<SettingsApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return SettingsApi(dio);
});
