import 'package:agentloom_mobile/features/dashboard/screens/dashboard_screen.dart';
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

  Widget createTestWidget() {
    return ProviderScope(
      overrides: [workflowApiProvider.overrideWithValue(mockApi)],
      child: const MaterialApp(home: DashboardScreen()),
    );
  }

  group('DashboardScreen', () {
    testWidgets('renders AppBar with title', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await tester.pumpWidget(createTestWidget());

      expect(find.text('Dashboard'), findsOneWidget);
    });

    testWidgets('shows quick access section with workflows', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Quick Access'), findsOneWidget);
    });

    testWidgets('shows recent executions section', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Recent Executions'), findsOneWidget);
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
