import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_detail_screen.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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
      child: const MaterialApp(home: AgentDetailScreen(agentId: 'agent-1')),
    );
  }

  Widget createRouterWidget() {
    final router = GoRouter(
      initialLocation: '/agents/agent-1',
      routes: [
        GoRoute(
          path: '/agents/:agentId',
          builder: (context, state) =>
              AgentDetailScreen(agentId: state.pathParameters['agentId']!),
        ),
        GoRoute(
          path: '/agents/:agentId/conversations/new',
          name: RouteNames.agentNewConversation,
          builder: (context, state) =>
              const Scaffold(body: Center(child: Text('draft-route'))),
        ),
      ],
    );

    return ProviderScope(
      overrides: [agentApiProvider.overrideWithValue(mockApi)],
      child: MaterialApp.router(routerConfig: router),
    );
  }

  group('AgentDetailScreen', () {
    testWidgets(
      'renders agent-main capability policies for mobile visibility',
      (tester) async {
        when(() => mockApi.getAgent('agent-1')).thenAnswer(
          (_) async => createTestAgent(
            id: 'agent-1',
            name: 'Agent Alpha',
            nodes: [
              {
                'id': 'main',
                'data': {
                  'nodeType': 'agent-main',
                  'config': {
                    'nativeToolPolicy': {
                      'readEnabled': false,
                      'writeEnabled': true,
                      'editEnabled': true,
                      'terminalEnabled': false,
                    },
                    'selfEvolutionPolicy': {
                      'enabled': true,
                      'resourceManagement': true,
                      'externalEditing': false,
                      'sandboxManagement': true,
                    },
                  },
                },
              },
            ],
          ),
        );
        when(
          () => mockApi.listConversations('agent-1'),
        ).thenAnswer((_) async => []);

        await tester.pumpWidget(createTestWidget());
        await tester.pumpAndSettle();

        expect(find.text('Runtime Capabilities'), findsOneWidget);
        expect(find.text('Native Tools'), findsOneWidget);
        expect(find.text('Self Evolution'), findsOneWidget);
        expect(find.text('Read Off'), findsOneWidget);
        expect(find.text('Write On'), findsOneWidget);
        expect(find.text('Enabled On'), findsOneWidget);
        expect(find.text('Resource Mgmt On'), findsOneWidget);
        expect(find.text('External Edit Off'), findsOneWidget);
        expect(find.text('Sandbox Mgmt On'), findsOneWidget);
      },
    );

    testWidgets('无 sandbox agent 会显示正确的运行形态与原生工具说明', (tester) async {
      when(() => mockApi.getAgent('agent-1')).thenAnswer(
        (_) async => createTestAgent(
          id: 'agent-1',
          name: 'Agent Alpha',
          runtimeMode: 'no_sandbox',
        ),
      );
      when(
        () => mockApi.listConversations('agent-1'),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('无沙箱'), findsOneWidget);
      expect(find.textContaining('无 sandbox Agent 不提供内置'), findsOneWidget);
      expect(find.textContaining('可使用 Skill、知识库、记忆、HTTP MCP'), findsOneWidget);
      expect(find.text('Read Off'), findsOneWidget);
      expect(find.text('Terminal Off'), findsOneWidget);
    });

    testWidgets('点击 New Chat 应进入草稿对话路由', (tester) async {
      when(() => mockApi.getAgent('agent-1')).thenAnswer(
        (_) async => createTestAgent(
          id: 'agent-1',
          name: 'Agent Alpha',
          status: 'published',
        ),
      );
      when(
        () => mockApi.listConversations('agent-1'),
      ).thenAnswer((_) async => []);

      await tester.pumpWidget(createRouterWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('New Chat'));
      await tester.pumpAndSettle();

      verifyNever(
        () => mockApi.createConversation(
          any(),
          title: any(named: 'title'),
          metadata: any(named: 'metadata'),
        ),
      );
      expect(find.text('draft-route'), findsOneWidget);
    });
  });
}
