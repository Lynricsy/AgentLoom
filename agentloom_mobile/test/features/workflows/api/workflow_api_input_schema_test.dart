import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

Response<dynamic> okResponse(dynamic data) => Response(
  data: data,
  statusCode: 200,
  requestOptions: RequestOptions(path: '/'),
);

void main() {
  late MockDio mockDio;
  late WorkflowApi api;

  setUp(() {
    mockDio = MockDio();
    api = WorkflowApi(mockDio);
  });

  group('getInputSchema', () {
    test('发送 GET 到正确端点', () async {
      when(
        () => mockDio.get('/api/v1/workflow-definitions/wf-1/input-schema'),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {'version': 1, 'collection_mode': 'form', 'fields': []},
        }),
      );

      final schema = await api.getInputSchema('wf-1');
      expect(schema.version, 1);
      expect(schema.collectionMode, 'form');
      expect(schema.fields, isEmpty);
      verify(
        () => mockDio.get('/api/v1/workflow-definitions/wf-1/input-schema'),
      ).called(1);
    });

    test('正确解析响应字段', () async {
      when(
        () => mockDio.get('/api/v1/workflow-definitions/wf-2/input-schema'),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {
            'version': 2,
            'collection_mode': 'conversation',
            'fields': [
              {'id': 'f1', 'type': 'text', 'label': '标题'},
            ],
          },
        }),
      );

      final schema = await api.getInputSchema('wf-2');
      expect(schema.version, 2);
      expect(schema.collectionMode, 'conversation');
      expect(schema.fields.length, 1);
      expect(schema.fields.first.label, '标题');
    });

    test('兼容 camelCase 响应并归一化 nested validation', () async {
      when(
        () => mockDio.get('/api/v1/workflow-definitions/wf-3/input-schema'),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {
            'version': 1,
            'collectionMode': 'conversation',
            'fields': [
              {
                'id': 'topic',
                'type': 'text',
                'label': '分析主题',
                'validation': {'minLength': 3, 'maxLength': 200},
              },
            ],
          },
        }),
      );

      final schema = await api.getInputSchema('wf-3');
      expect(schema.collectionMode, 'conversation');
      expect(schema.fields.first.validation?.minLength, 3);
      expect(schema.fields.first.validation?.maxLength, 200);
    });

    test('兼容 visibility 的 camelCase/snake_case 响应', () async {
      when(
        () => mockDio.get('/api/v1/workflow-definitions/wf-4/input-schema'),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {
            'version': 1,
            'collectionMode': 'form',
            'fields': [
              {'id': 'mode', 'type': 'single_select', 'label': '模式'},
              {
                'id': 'advanced_note',
                'type': 'text',
                'label': '高级说明',
                'visibility': {'field_id': 'mode', 'equals': 'advanced'},
              },
            ],
          },
        }),
      );

      final schema = await api.getInputSchema('wf-4');
      expect(schema.fields[1].visibility?.fieldId, 'mode');
      expect(schema.fields[1].visibility?.equals, 'advanced');
    });

    test('API 错误时抛出 DioException', () async {
      when(
        () => mockDio.get('/api/v1/workflow-definitions/wf-bad/input-schema'),
      ).thenThrow(
        DioException(
          type: DioExceptionType.badResponse,
          requestOptions: RequestOptions(path: '/'),
          response: Response(
            statusCode: 409,
            requestOptions: RequestOptions(path: '/'),
          ),
        ),
      );

      expect(() => api.getInputSchema('wf-bad'), throwsA(isA<DioException>()));
    });
  });

  group('runWorkflow (扩展参数)', () {
    test('发送 POST 包含 inputParams、schemaVersion 和 launchSource', () async {
      when(
        () => mockDio.post(
          '/api/v1/workflow-definitions/wf-1/run',
          data: any(named: 'data'),
        ),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {'id': 'exec-123'},
        }),
      );

      final result = await api.runWorkflow(
        'wf-1',
        inputParams: {'title': 'hello'},
        schemaVersion: 3,
        launchSource: 'mobile',
      );

      expect(result['data'], isA<Map<String, dynamic>>());
      final capturedCall = verify(
        () => mockDio.post(
          '/api/v1/workflow-definitions/wf-1/run',
          data: captureAny(named: 'data'),
        ),
      );
      capturedCall.called(1);
      final sentBody = capturedCall.captured.first as Map<String, dynamic>;
      expect(sentBody['inputParams'], {'title': 'hello'});
      expect(sentBody['schemaVersion'], 3);
      expect(sentBody['launchSource'], 'mobile');
    });

    test('发送 POST 不包含可选参数时 body 为空 JSON 对象', () async {
      when(
        () => mockDio.post(
          '/api/v1/workflow-definitions/wf-2/run',
          data: any(named: 'data'),
        ),
      ).thenAnswer(
        (_) async => okResponse({
          'data': {'id': 'exec-456'},
        }),
      );

      await api.runWorkflow('wf-2');

      final capturedCall = verify(
        () => mockDio.post(
          '/api/v1/workflow-definitions/wf-2/run',
          data: captureAny(named: 'data'),
        ),
      );
      capturedCall.called(1);
      expect(capturedCall.captured.first, const <String, dynamic>{});
    });
  });
}
