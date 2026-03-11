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
}
