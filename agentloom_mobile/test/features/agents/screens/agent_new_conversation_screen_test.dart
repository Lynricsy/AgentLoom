import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/models/agent_conversation_dto.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_conversation_screen.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_new_conversation_screen.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
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

  GoRouter createRouter() {
    return GoRouter(
      initialLocation: '/agents/agent-001/conversations/new',
      routes: [
        GoRoute(
          path: '/agents/:agentId/conversations/new',
          builder: (context, state) {
            final agentId = state.pathParameters['agentId']!;
            return AgentNewConversationScreen(agentId: agentId);
          },
        ),
        GoRoute(
          path: '/agents/:agentId/conversations/:conversationId',
          name: RouteNames.agentConversation,
          builder: (context, state) {
            final agentId = state.pathParameters['agentId']!;
            final conversationId = state.pathParameters['conversationId']!;
            return AgentConversationScreen(
              agentId: agentId,
              conversationId: conversationId,
            );
          },
        ),
      ],
    );
  }

  Widget createTestWidget() {
    return ProviderScope(
      overrides: [
        agentApiProvider.overrideWithValue(mockApi),
      ],
      child: MaterialApp.router(
        routerConfig: createRouter(),
      ),
    );
  }

  testWidgets('进入 new 路由时应先创建对话再跳转', (tester) async {
    when(
      () => mockApi.createConversation(
        any(),
        title: any(named: 'title'),
        metadata: any(named: 'metadata'),
      ),
    ).thenAnswer(
      (_) async => const AgentConversationDto(
        id: 'conv-002',
        agentDefinitionId: 'agent-001',
        status: 'active',
        title: '新对话',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      ),
    );
    when(
      () => mockApi.getMessages(
        any(),
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).thenAnswer(
      (_) async => const PaginatedResponse<ConversationMessageDto>(
        data: <ConversationMessageDto>[],
        meta: PaginationMeta(
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
        ),
      ),
    );
    when(
      () => mockApi.getWorkspaceTree(any()),
    ).thenAnswer((_) async => const []);

    await tester.pumpWidget(createTestWidget());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    verify(
      () => mockApi.createConversation(
        'agent-001',
        title: '新对话',
        metadata: any(named: 'metadata'),
      ),
    ).called(1);
    verify(
      () => mockApi.getMessages(
        'conv-002',
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).called(greaterThanOrEqualTo(1));

    expect(find.byType(AgentConversationScreen), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });
}
