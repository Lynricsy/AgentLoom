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

        expect(find.text('运行时能力'), findsOneWidget);
        expect(find.text('原生工具'), findsOneWidget);
        expect(find.text('自我进化'), findsOneWidget);
        expect(find.text('读取 关'), findsOneWidget);
        expect(find.text('写入 开'), findsOneWidget);
        expect(find.text('已启用 开'), findsOneWidget);
        expect(find.text('资源管理 开'), findsOneWidget);
        expect(find.text('外部编辑 关'), findsOneWidget);
        expect(find.text('沙箱管理 开'), findsOneWidget);
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
      expect(find.textContaining('无沙箱 Agent 不提供内置'), findsOneWidget);
      expect(find.textContaining('可使用 Skill、知识库、记忆、HTTP MCP'), findsOneWidget);
      expect(find.text('读取 关'), findsOneWidget);
      expect(find.text('终端 关'), findsOneWidget);
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

      await tester.tap(find.text('新对话'));
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
