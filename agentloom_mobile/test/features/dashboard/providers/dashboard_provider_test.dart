import 'dart:async';

import 'package:agentloom_mobile/features/dashboard/providers/dashboard_provider.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/models/models.dart';
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

  group('recentWorkflowsProvider', () {
    test('fetches 5 published workflows', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      final result = await container.read(recentWorkflowsProvider.future);

      expect(result, isA<List<WorkflowDefinitionDto>>());
      verify(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: 5,
          status: 'published',
          search: any(named: 'search'),
        ),
      ).called(1);
    });

    test('returns empty list when no workflows', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async =>
            createTestWorkflowList(workflows: [], total: 0, totalPages: 0),
      );

      final result = await container.read(recentWorkflowsProvider.future);

      expect(result, isEmpty);
    });

    test('propagates API errors', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => throw Exception('Network error'));

      // 用 listen + Completer 等待 provider 进入 error 状态
      final completer = Completer<void>();
      container.listen(recentWorkflowsProvider, (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      await completer.future;

      final state = container.read(recentWorkflowsProvider);
      expect(state.hasError, isTrue);
      expect(state.error, isA<Exception>());
    });
  });

  group('recentExecutionsProvider', () {
    test('flattens workflow executions and keeps newest five', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => createTestWorkflowList(
          workflows: [
            createTestWorkflow(id: 'wf-1', name: 'Workflow 1'),
            createTestWorkflow(id: 'wf-2', name: 'Workflow 2'),
          ],
        ),
      );
      when(
        () => mockApi.listExecutions(
          'wf-1',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => createTestExecutionList(
          executions: [
            createTestExecution(
              id: 'exec-1',
              workflowId: 'wf-1',
              createdAt: '2026-01-03T10:00:00.000Z',
            ),
            createTestExecution(
              id: 'exec-2',
              workflowId: 'wf-1',
              createdAt: '2026-01-02T10:00:00.000Z',
            ),
            createTestExecution(
              id: 'exec-3',
              workflowId: 'wf-1',
              createdAt: '2026-01-01T10:00:00.000Z',
            ),
          ],
        ),
      );
      when(
        () => mockApi.listExecutions(
          'wf-2',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => createTestExecutionList(
          executions: [
            createTestExecution(
              id: 'exec-4',
              workflowId: 'wf-2',
              createdAt: '2026-01-04T10:00:00.000Z',
            ),
            createTestExecution(
              id: 'exec-5',
              workflowId: 'wf-2',
              createdAt: '2026-01-02T12:00:00.000Z',
            ),
            createTestExecution(
              id: 'exec-6',
              workflowId: 'wf-2',
              createdAt: '2026-01-01T08:00:00.000Z',
            ),
          ],
        ),
      );

      final result = await container.read(recentExecutionsProvider.future);

      expect(result, hasLength(5));
      expect(result.first.id, 'exec-4');
      expect(result.first.workflowName, 'Workflow 2');
      expect(result.last.id, 'exec-3');
    });
  });
}
