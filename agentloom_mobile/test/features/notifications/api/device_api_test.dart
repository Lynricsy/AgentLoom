import 'package:agentloom_mobile/features/notifications/api/device_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late MockDio mockDio;
  late DeviceApi api;

  setUp(() {
    mockDio = MockDio();
    api = DeviceApi(mockDio);
  });

  test('registerDevice 调用正确端点与数据', () async {
    when(
      () => mockDio.post(
        '/devices/register',
        data: {'deviceToken': 'token-1', 'platform': 'android'},
      ),
    ).thenAnswer(
      (_) async => Response<void>(
        requestOptions: RequestOptions(path: '/devices/register'),
      ),
    );

    await api.registerDevice(deviceToken: 'token-1', platform: 'android');

    verify(
      () => mockDio.post(
        '/devices/register',
        data: {'deviceToken': 'token-1', 'platform': 'android'},
      ),
    ).called(1);
  });

  test('unregisterDevice 调用正确端点与数据', () async {
    when(
      () => mockDio.delete(
        '/devices/unregister',
        data: {'deviceToken': 'token-2'},
      ),
    ).thenAnswer(
      (_) async => Response<void>(
        requestOptions: RequestOptions(path: '/devices/unregister'),
      ),
    );

    await api.unregisterDevice(deviceToken: 'token-2');

    verify(
      () => mockDio.delete(
        '/devices/unregister',
        data: {'deviceToken': 'token-2'},
      ),
    ).called(1);
  });

  test('DioException 会继续向外抛出', () async {
    final exception = DioException(
      requestOptions: RequestOptions(path: '/devices/register'),
    );

    when(
      () => mockDio.post(
        '/devices/register',
        data: {'deviceToken': 'token-error', 'platform': 'android'},
      ),
    ).thenThrow(exception);

    await expectLater(
      api.registerDevice(deviceToken: 'token-error', platform: 'android'),
      throwsA(same(exception)),
    );
  });
}
