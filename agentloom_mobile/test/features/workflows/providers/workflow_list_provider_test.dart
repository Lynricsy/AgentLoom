import 'dart:async';

import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/providers/workflow_list_provider.dart';
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

  group('WorkflowListNotifier', () {
    test('build() fetches initial workflow list', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      // 读取 provider 触发 build
      final sub = container.listen(workflowListProvider, (_, __) {});

      // 等待异步完成
      await container.read(workflowListProvider.future);

      final state = container.read(workflowListProvider).value!;
      expect(state.workflows.length, 2);
      expect(state.meta?.total, 2);
      expect(state.statusFilter, isNull);
      expect(state.searchQuery, isNull);
      expect(state.isLoadingMore, isFalse);

      sub.close();
    });

    test('setStatusFilter triggers refetch with filter', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await container.read(workflowListProvider.future);

      // 设置过滤条件
      container.read(workflowListProvider.notifier).setStatusFilter('draft');

      await container.read(workflowListProvider.future);

      // 应该调用了 2 次（初始 + 过滤后）
      verify(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).called(2);
    });

    test('setSearchQuery triggers refetch with query', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await container.read(workflowListProvider.future);

      container.read(workflowListProvider.notifier).setSearchQuery('test');

      await container.read(workflowListProvider.future);

      verify(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).called(2);
    });

    test('refresh refetches current state', () async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await container.read(workflowListProvider.future);

      await container.read(workflowListProvider.notifier).refresh();

      verify(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).called(2);
    });

    test('loadMore failure preserves loaded workflows', () async {
      var callCount = 0;
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) {
          return createTestWorkflowList(
            workflows: [createTestWorkflow(id: 'workflow-1')],
            total: 2,
            page: 1,
            pageSize: 1,
            totalPages: 2,
          );
        }
        throw Exception('load more failed');
      });

      await container.read(workflowListProvider.future);
      await container.read(workflowListProvider.notifier).loadMore();

      final asyncState = container.read(workflowListProvider);
      expect(asyncState.hasValue, isTrue);
      expect(asyncState.hasError, isFalse);
      expect(asyncState.value!.workflows.single.id, 'workflow-1');
      expect(asyncState.value!.isLoadingMore, isFalse);
      expect(asyncState.value!.loadMoreError, isA<Exception>());
    });

    test('handles API error gracefully', () async {
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
      container.listen(workflowListProvider, (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      await completer.future;

      final state = container.read(workflowListProvider);
      expect(state.hasError, isTrue);
      expect(state.error, isA<Exception>());
    });
  });
}
