import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/providers/api_client_provider.dart';

class DeviceApi {
  DeviceApi(this._dio);

  final Dio _dio;

  Future<void> registerDevice({
    required String deviceToken,
    required String platform,
  }) async {
    await _dio.post(
      '/devices/register',
      data: {'deviceToken': deviceToken, 'platform': platform},
    );
  }

  Future<void> unregisterDevice({required String deviceToken}) async {
    await _dio.delete(
      '/devices/unregister',
      data: {'deviceToken': deviceToken},
    );
  }
}

final deviceApiProvider = Provider<DeviceApi>((ref) {
  final dio = ref.watch(apiClientProvider);
  return DeviceApi(dio);
});
