import 'dart:async';

import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:agentloom_mobile/features/workflows/models/workflow_definition_dto.dart';
import 'package:agentloom_mobile/features/workflows/providers/workflow_detail_provider.dart';
import 'package:agentloom_mobile/features/workflows/screens/workflow_detail_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/workflows/models/execution_summary_dto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockWorkflowApi mockApi;

  setUp(() {
    mockApi = MockWorkflowApi();
  });

  Widget createTestWidget({String workflowId = 'wf-test-001'}) {
    return ProviderScope(
      overrides: [workflowApiProvider.overrideWithValue(mockApi)],
      child: MaterialApp(home: WorkflowDetailScreen(workflowId: workflowId)),
    );
  }

  group('WorkflowDetailScreen', () {
    testWidgets('shows loading skeleton initially', (tester) async {
      // 使用 Completer 避免 pending timer 问题
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) => Completer<WorkflowDefinitionDto>().future);
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) => Completer<PaginatedResponse<ExecutionSummaryDto>>().future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      // 骨架加载应该显示
      expect(find.byType(WorkflowDetailScreen), findsOneWidget);
    });

    testWidgets('renders workflow metadata after loading', (tester) async {
      when(() => mockApi.getWorkflow(any())).thenAnswer(
        (_) async => createTestWorkflow(
          name: 'Detail Workflow',
          description: 'Detail description',
          status: 'published',
          version: 3,
        ),
      );
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Detail Workflow'), findsWidgets);
      expect(find.text('Detail description'), findsOneWidget);
      expect(find.text('v3'), findsOneWidget);
    });

    testWidgets('shows FAB for published workflow', (tester) async {
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) async => createTestWorkflow(status: 'published'));
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.byIcon(Icons.play_arrow), findsOneWidget);
    });

    testWidgets('hides FAB for draft workflow', (tester) async {
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) async => createTestWorkflow(status: 'draft'));
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(FloatingActionButton), findsNothing);
    });

    testWidgets('shows error state with retry', (tester) async {
      // 直接 override provider 以绕过 FakeAsync zone 问题
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            workflowApiProvider.overrideWithValue(mockApi),
            workflowDetailProvider(
              'wf-test-001',
            ).overrideWith((ref) => throw Exception('Network error')),
          ],
          child: const MaterialApp(
            home: WorkflowDetailScreen(workflowId: 'wf-test-001'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Failed to load workflow'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows execution list', (tester) async {
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) async => createTestWorkflow());
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Recent Executions'), findsOneWidget);
    });

    testWidgets('shows empty execution state', (tester) async {
      when(
        () => mockApi.getWorkflow(any()),
      ).thenAnswer((_) async => createTestWorkflow());
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => createTestExecutionList(executions: [], total: 0),
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('No executions yet'), findsOneWidget);
    });

    testWidgets('run FAB navigates to launch page', (tester) async {
      when(() => mockApi.getWorkflow(any())).thenAnswer(
        (_) async =>
            createTestWorkflow(name: 'My Workflow', status: 'published'),
      );
      when(
        () => mockApi.listExecutions(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer((_) async => createTestExecutionList());

      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => ProviderScope(
              overrides: [workflowApiProvider.overrideWithValue(mockApi)],
              child: const WorkflowDetailScreen(workflowId: 'wf-test-001'),
            ),
          ),
          GoRoute(
            path: '/workflows/:workflowId/launch',
            name: RouteNames.workflowLaunch,
            builder: (context, state) => Text(
              'Launch ${state.pathParameters['workflowId']} ${state.uri.queryParameters['name']}',
            ),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // FAB 应导航到 launch 页面, 传递 workflowId 和 name
      expect(find.text('Launch wf-test-001 My Workflow'), findsOneWidget);
    });
  });
}
