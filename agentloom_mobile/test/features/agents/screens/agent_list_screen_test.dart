import 'dart:async';

import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_list_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/features/agents/models/agent_definition_dto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockAgentApi mockApi;

  setUp(() {
    mockApi = MockAgentApi();
  });

  Widget createTestWidget() {
    return ProviderScope(
      overrides: [agentApiProvider.overrideWithValue(mockApi)],
      child: const MaterialApp(home: AgentListScreen()),
    );
  }

  group('AgentListScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) => Completer<PaginatedResponse<AgentDefinitionDto>>().future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(AgentListScreen), findsOneWidget);
    });

    testWidgets('renders agent cards after loading', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestAgentList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Agent Alpha'), findsOneWidget);
      expect(find.text('Agent Beta'), findsOneWidget);
    });

    testWidgets('shows search field', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestAgentList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('shows filter chips', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestAgentList());

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 状态筛选按钮应存在
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Published'), findsWidgets);
      expect(find.text('Draft'), findsWidgets);
    });

    testWidgets('shows empty state when no agents', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => createTestAgentList(agents: [], total: 0));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('No agents found'), findsOneWidget);
    });

    testWidgets('shows error state on API failure', (tester) async {
      when(
        () => mockApi.listAgents(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          search: any(named: 'search'),
        ),
      ).thenThrow(Exception('Network error'));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Failed to load agents'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
