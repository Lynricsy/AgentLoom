import 'dart:async';

import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_input_schema.dart';
import 'package:agentloom_mobile/features/workflows/providers/workflow_launch_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockWorkflowApi mockApi;
  late ProviderContainer container;

  setUp(() {
    mockApi = MockWorkflowApi();
    container = ProviderContainer(
      overrides: [workflowApiProvider.overrideWithValue(mockApi)],
    );
  });

  tearDown(() {
    container.dispose();
  });

  WorkflowInputSchema schemaWithTextField() {
    return createTestWorkflowInputSchema(
      fields: [
        createTestInputFieldDefinition(
          id: 'title',
          type: 'text',
          label: '标题',
          required: true,
        ),
      ],
    );
  }

  group('build()', () {
    test('加载 schema 并进入 SchemaLoaded 状态', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);

      final state = await container.read(workflowLaunchProvider('wf-1').future);

      expect(state, isA<WorkflowLaunchSchemaLoaded>());
      expect((state as WorkflowLaunchSchemaLoaded).schema.fields.length, 1);
      verify(() => mockApi.getInputSchema('wf-1')).called(1);
    });

    test('API 错误时 provider 进入 error 状态', () async {
      when(() => mockApi.getInputSchema(any())).thenThrow(Exception('Failed'));

      final completer = Completer<void>();
      container.listen(workflowLaunchProvider('wf-bad'), (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      await completer.future;

      final state = container.read(workflowLaunchProvider('wf-bad'));
      expect(state.hasError, isTrue);
    });
  });

  group('submit()', () {
    test('提交成功后进入 Success 状态，返回 executionId', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-777'},
        },
      );

      // 等待 schema 加载
      await container.read(workflowLaunchProvider('wf-1').future);

      // 提交
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({'title': 'hello'});

      expect(result, 'exec-777');
      final currentState = container.read(workflowLaunchProvider('wf-1'));
      expect(currentState.value, isA<WorkflowLaunchSuccess>());
      expect(
        (currentState.value as WorkflowLaunchSuccess).executionId,
        'exec-777',
      );
    });

    test('从顶层 response 提取 executionId (无 data 嵌套)', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenAnswer((_) async => {'id': 'exec-888'});

      await container.read(workflowLaunchProvider('wf-1').future);
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({});

      expect(result, 'exec-888');
    });

    test('DioException 409 → 未发布消息', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
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

      await container.read(workflowLaunchProvider('wf-1').future);
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({});

      expect(result, isNull);
      final state = container.read(workflowLaunchProvider('wf-1'));
      expect(state.value, isA<WorkflowLaunchError>());
      expect((state.value as WorkflowLaunchError).message, '此工作流尚未发布，无法启动');
    });

    test('DioException 401 → 认证过期消息', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenThrow(
        DioException(
          type: DioExceptionType.badResponse,
          requestOptions: RequestOptions(path: '/'),
          response: Response(
            statusCode: 401,
            requestOptions: RequestOptions(path: '/'),
          ),
        ),
      );

      await container.read(workflowLaunchProvider('wf-1').future);
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({});

      expect(result, isNull);
      final state = container.read(workflowLaunchProvider('wf-1'));
      expect((state.value as WorkflowLaunchError).message, '认证已过期，请重新登录');
    });

    test('DioException timeout → 超时消息', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenThrow(
        DioException(
          type: DioExceptionType.connectionTimeout,
          requestOptions: RequestOptions(path: '/'),
        ),
      );

      await container.read(workflowLaunchProvider('wf-1').future);
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({});

      expect(result, isNull);
      final state = container.read(workflowLaunchProvider('wf-1'));
      expect((state.value as WorkflowLaunchError).message, '网络连接超时，请稍后重试');
    });

    test('通用异常 → 启动失败消息', () async {
      final schema = schemaWithTextField();
      when(
        () => mockApi.getInputSchema('wf-1'),
      ).thenAnswer((_) async => schema);
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenThrow(StateError('oops'));

      await container.read(workflowLaunchProvider('wf-1').future);
      final notifier = container.read(workflowLaunchProvider('wf-1').notifier);
      final result = await notifier.submit({});

      expect(result, isNull);
      final state = container.read(workflowLaunchProvider('wf-1'));
      expect((state.value as WorkflowLaunchError).message, contains('启动失败'));
    });
  });
}
