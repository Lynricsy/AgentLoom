import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockDio dio;
  late ResourcesApi api;

  setUp(() {
    dio = MockDio();
    api = ResourcesApi(dio);
  });

  Response<dynamic> response(Object? data) => Response<dynamic>(
    data: data,
    statusCode: 200,
    requestOptions: RequestOptions(),
  );

  test('非列表 envelope 抛出 ApiContractException', () async {
    when(() => dio.get('/api/v1/api-keys')).thenAnswer(
      (_) async => response({'data': {'id': 'not-a-list'}}),
    );
    await expectLater(api.listApiKeys(), throwsA(isA<ApiContractException>()));
  });

  test('列表元素缺少必填字段抛出 ApiContractException', () async {
    when(() => dio.get('/api/v1/llm-providers')).thenAnswer(
      (_) async => response({'data': [{'name': '缺少 id'}]}),
    );
    await expectLater(
      api.listLlmProviderEntities(),
      throwsA(isA<ApiContractException>()),
    );
  });

  test('列表元素字段类型错误抛出 ApiContractException', () async {
    when(() => dio.get('/api/v1/llm-providers')).thenAnswer(
      (_) async => response({'data': [
        {
          'id': 42,
          'orgId': 'org',
          'tenantId': 'tenant',
          'slug': 'custom',
          'name': 'Custom',
          'createdAt': 'now',
          'updatedAt': 'now',
        },
      ]}),
    );
    await expectLater(
      api.listLlmProviderEntities(),
      throwsA(isA<ApiContractException>()),
    );
  });
}
