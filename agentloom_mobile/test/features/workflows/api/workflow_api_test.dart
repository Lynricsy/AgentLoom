import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockDio mockDio;
  late WorkflowApi api;

  setUp(() {
    mockDio = MockDio();
    api = WorkflowApi(mockDio);
  });

  Response<dynamic> okResponse(Map<String, dynamic> data) {
    return Response(
      data: data,
      statusCode: 200,
      requestOptions: RequestOptions(),
    );
  }

  group('WorkflowApi', () {
    group('listWorkflows', () {
      test('sends correct request parameters', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => okResponse({
            'data': <dynamic>[],
            'meta': {'total': 0, 'page': 1, 'page_size': 20, 'total_pages': 0},
          }),
        );

        await api.listWorkflows(page: 2, pageSize: 10, status: 'draft');

        verify(
          () => mockDio.get(
            '/api/v1/workflow-definitions',
            queryParameters: {'page': 2, 'pageSize': 10, 'status': 'draft'},
          ),
        ).called(1);
      });

      test('omits null optional params', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => okResponse({
            'data': <dynamic>[],
            'meta': {'total': 0, 'page': 1, 'page_size': 20, 'total_pages': 0},
          }),
        );

        await api.listWorkflows();

        final captured =
            verify(
                  () => mockDio.get(
                    any(),
                    queryParameters: captureAny(named: 'queryParameters'),
                  ),
                ).captured.single
                as Map<String, dynamic>;

        expect(captured.containsKey('status'), isFalse);
        expect(captured.containsKey('search'), isFalse);
      });

      test('parses response into PaginatedResponse', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => okResponse({
            'data': [
              {
                'id': 'wf-1',
                'name': 'Workflow 1',
                'slug': 'workflow-1',
                'status': 'published',
                'version': 1,
                'created_at': '2026-01-01T00:00:00.000Z',
                'updated_at': '2026-01-01T00:00:00.000Z',
              },
            ],
            'meta': {'total': 1, 'page': 1, 'page_size': 20, 'total_pages': 1},
          }),
        );

        final result = await api.listWorkflows();

        expect(result, isA<PaginatedResponse<WorkflowDefinitionDto>>());
        expect(result.data.length, 1);
        expect(result.data.first.name, 'Workflow 1');
        expect(result.meta.total, 1);
      });
    });

    group('getWorkflow', () {
      test('sends correct request and parses response', () async {
        when(() => mockDio.get(any())).thenAnswer(
          (_) async => okResponse({
            'data': {
              'id': 'wf-1',
              'name': 'Test',
              'slug': 'test',
              'status': 'draft',
              'version': 1,
              'created_at': '2026-01-01T00:00:00.000Z',
              'updated_at': '2026-01-01T00:00:00.000Z',
            },
          }),
        );

        final result = await api.getWorkflow('wf-1');

        verify(
          () => mockDio.get('/api/v1/workflow-definitions/wf-1'),
        ).called(1);
        expect(result, isA<WorkflowDefinitionDto>());
        expect(result.id, 'wf-1');
      });
    });

    group('listExecutions', () {
      test('sends correct request with workflow ID', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => okResponse({
            'data': <dynamic>[],
            'meta': {'total': 0, 'page': 1, 'page_size': 5, 'total_pages': 0},
          }),
        );

        await api.listExecutions('wf-1', pageSize: 5);

        verify(
          () => mockDio.get(
            '/api/v1/workflow-definitions/wf-1/executions',
            queryParameters: {'page': 1, 'pageSize': 5},
          ),
        ).called(1);
      });
    });

    group('runWorkflow', () {
      test('sends POST request', () async {
        when(() => mockDio.post(any())).thenAnswer(
          (_) async => Response(
            data: {'executionId': 'exec-1'},
            statusCode: 201,
            requestOptions: RequestOptions(),
          ),
        );

        final result = await api.runWorkflow('wf-1');

        verify(
          () => mockDio.post('/api/v1/workflow-definitions/wf-1/run'),
        ).called(1);
        expect(result['executionId'], 'exec-1');
      });
    });

    group('getExecution', () {
      test('sends correct request and parses response', () async {
        when(() => mockDio.get(any())).thenAnswer(
          (_) async => okResponse({
            'data': {
              'id': 'exec-1',
              'workflow_id': 'wf-1',
              'status': 'running',
              'trigger_type': 'manual',
              'total_steps': 3,
              'completed_steps': 1,
              'started_at': '2026-01-01T10:00:00.000Z',
              'created_at': '2026-01-01T10:00:00.000Z',
              'updated_at': '2026-01-01T10:00:00.000Z',
            },
          }),
        );

        final result = await api.getExecution('exec-1');

        verify(() => mockDio.get('/api/v1/executions/exec-1')).called(1);
        expect(result, isA<ExecutionSummaryDto>());
        expect(result.id, 'exec-1');
        expect(result.status, 'running');
        expect(result.workflowId, 'wf-1');
      });

      test('throws DioException on network error', () async {
        when(() => mockDio.get(any())).thenThrow(
          DioException(
            type: DioExceptionType.connectionTimeout,
            requestOptions: RequestOptions(),
          ),
        );

        expect(() => api.getExecution('exec-1'), throwsA(isA<DioException>()));
      });

      test('throws DioException on 404', () async {
        when(() => mockDio.get(any())).thenThrow(
          DioException(
            type: DioExceptionType.badResponse,
            response: Response(
              statusCode: 404,
              requestOptions: RequestOptions(),
            ),
            requestOptions: RequestOptions(),
          ),
        );

        expect(
          () => api.getExecution('nonexistent'),
          throwsA(isA<DioException>()),
        );
      });
    });
  });
}
