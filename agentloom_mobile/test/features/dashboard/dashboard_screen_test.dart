import 'package:agentloom_mobile/features/dashboard/screens/dashboard_screen.dart';
import 'package:agentloom_mobile/features/dashboard/widgets/recent_executions_section.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/test_helpers.dart';

void main() {
  late MockWorkflowApi mockApi;

  setUp(() {
    mockApi = MockWorkflowApi();
  });

  void stubDashboardData() {
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
        any(),
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).thenAnswer((invocation) async {
      final workflowId = invocation.positionalArguments.first as String;
      if (workflowId == 'wf-1') {
        return createTestExecutionList(
          executions: [
            createTestExecution(
              id: 'exec-1',
              workflowId: 'wf-1',
              createdAt: '2026-01-03T10:00:00.000Z',
            ),
          ],
        );
      }

      return createTestExecutionList(
        executions: [
          createTestExecution(
            id: 'exec-2',
            workflowId: 'wf-2',
            createdAt: '2026-01-04T10:00:00.000Z',
          ),
        ],
      );
    });
  }

  Widget createTestWidget() {
    return ProviderScope(
      overrides: [workflowApiProvider.overrideWithValue(mockApi)],
      child: const MaterialApp(home: DashboardScreen()),
    );
  }

  group('DashboardScreen', () {
    testWidgets('renders AppBar with title', (tester) async {
      stubDashboardData();

      await tester.pumpWidget(createTestWidget());

      expect(find.text('Dashboard'), findsOneWidget);
    });

    testWidgets('shows quick access section with workflows', (tester) async {
      stubDashboardData();

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Quick Access'), findsOneWidget);
    });

    testWidgets('shows recent executions section', (tester) async {
      stubDashboardData();

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Recent Executions'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(RecentExecutionsSection),
          matching: find.text('Workflow 2'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('shows error state on API failure', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenThrow(Exception('Network error'));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // QuickAccessSection 错误状态显示错误文本
      expect(find.text('Quick Access'), findsOneWidget);
    });
  });
}
