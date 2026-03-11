import 'dart:async';

import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/screens/workflows_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
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
      child: const MaterialApp(home: WorkflowsScreen()),
    );
  }

  group('WorkflowsScreen', () {
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

      expect(find.text('Workflows'), findsOneWidget);
    });

    testWidgets('shows loading indicator initially', (tester) async {
      // 使用 Completer 避免 pending timer 问题
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) => Completer<PaginatedResponse<WorkflowDefinitionDto>>().future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders search field', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await tester.pumpWidget(createTestWidget());

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Search workflows...'), findsOneWidget);
    });

    testWidgets('renders filter chips', (tester) async {
      when(
        () => mockApi.listWorkflows(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestWorkflowList());

      await tester.pumpWidget(createTestWidget());

      expect(find.text('All'), findsOneWidget);
      expect(find.text('Draft'), findsOneWidget);
      expect(find.text('Published'), findsOneWidget);
      expect(find.text('Archived'), findsOneWidget);
    });

    testWidgets('shows workflow list after loading', (tester) async {
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

      expect(find.text('Workflow 1'), findsOneWidget);
      expect(find.text('Workflow 2'), findsOneWidget);
    });

    testWidgets('shows empty state when no workflows', (tester) async {
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

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('No workflows found'), findsOneWidget);
    });

    testWidgets('shows error state with retry button', (tester) async {
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

      expect(find.text('Failed to load workflows'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
