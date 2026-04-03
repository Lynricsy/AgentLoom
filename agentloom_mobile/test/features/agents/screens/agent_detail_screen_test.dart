import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_detail_screen.dart';
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
      child: const MaterialApp(home: AgentDetailScreen(agentId: 'agent-1')),
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
  });
}
