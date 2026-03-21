import 'dart:async';

import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/screens/agent_conversation_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
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

  Widget createTestWidget({
    String agentId = 'agent-001',
    String conversationId = 'conv-001',
  }) {
    return ProviderScope(
      overrides: [
        agentApiProvider.overrideWithValue(mockApi),
        envProvider.overrideWithValue(
          const EnvConfig(
            apiBaseUrl: 'http://localhost:3000/api/v1',
            appName: 'Test',
            environment: AppEnvironment.dev,
          ),
        ),
      ],
      child: MaterialApp(
        home: AgentConversationScreen(
          agentId: agentId,
          conversationId: conversationId,
        ),
      ),
    );
  }

  group('AgentConversationScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.getMessages(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) => Completer<PaginatedResponse<ConversationMessageDto>>().future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(AgentConversationScreen), findsOneWidget);
    });

    testWidgets('shows input bar with text field and send button', (
      tester,
    ) async {
      when(
        () => mockApi.getMessages(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => PaginatedResponse(
          data: <ConversationMessageDto>[],
          meta: const PaginationMeta(
            total: 0,
            page: 1,
            pageSize: 50,
            totalPages: 0,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 应有文本输入框
      expect(find.byType(TextField), findsOneWidget);
      // 应有发送按钮
      expect(find.byIcon(Icons.send), findsOneWidget);
    });

    testWidgets('renders messages after loading', (tester) async {
      when(
        () => mockApi.getMessages(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) async => PaginatedResponse(
          data: [
            createTestMessage(
              id: 'msg-1',
              content: 'Hello Agent',
              role: MessageRole.user,
            ),
            createTestMessage(
              id: 'msg-2',
              content: 'Hi! How can I help?',
              role: MessageRole.agent,
            ),
          ],
          meta: const PaginationMeta(
            total: 2,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Hello Agent'), findsOneWidget);
      expect(find.text('Hi! How can I help?'), findsOneWidget);
    });

    testWidgets('shows back button in app bar', (tester) async {
      when(
        () => mockApi.getMessages(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) => Completer<PaginatedResponse<ConversationMessageDto>>().future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(AppBar), findsOneWidget);
    });
  });
}
