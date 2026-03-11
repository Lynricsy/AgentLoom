import 'dart:async';

import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/providers/workflow_detail_provider.dart';
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

  group('workflowDetailProvider', () {
    test('fetches workflow by ID', () async {
      final testWorkflow = createTestWorkflow(
        id: 'wf-detail',
        name: 'Detail Test',
      );
      when(
        () => mockApi.getWorkflow('wf-detail'),
      ).thenAnswer((_) async => testWorkflow);

      final result = await container.read(
        workflowDetailProvider('wf-detail').future,
      );

      expect(result.id, 'wf-detail');
      expect(result.name, 'Detail Test');
      verify(() => mockApi.getWorkflow('wf-detail')).called(1);
    });

    test('propagates API errors', () async {
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) async => throw Exception('Not found'));

      // 用 listen + Completer 等待 provider 进入 error 状态
      final completer = Completer<void>();
      container.listen(workflowDetailProvider('wf-bad'), (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      await completer.future;

      final state = container.read(workflowDetailProvider('wf-bad'));
      expect(state.hasError, isTrue);
      expect(state.error, isA<Exception>());
    });
  });

  group('workflowExecutionsProvider', () {
    test('fetches executions for workflow', () async {
      when(
        () => mockApi.listExecutions(
          'wf-1',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      final result = await container.read(
        workflowExecutionsProvider('wf-1').future,
      );

      expect(result.data.length, 2);
      expect(result.meta.total, 2);
    });

    test('propagates API errors', () async {
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => throw Exception('Server error'));

      // 用 listen + Completer 等待 provider 进入 error 状态
      final completer = Completer<void>();
      container.listen(workflowExecutionsProvider('wf-bad'), (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      await completer.future;

      final state = container.read(workflowExecutionsProvider('wf-bad'));
      expect(state.hasError, isTrue);
      expect(state.error, isA<Exception>());
    });
  });
}
