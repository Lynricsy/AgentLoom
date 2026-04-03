import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/preparation_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget createTestWidget({
    required bool showSandboxPhase,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: PreparationCard(
          phase: PreparationPhase.running,
          showSandboxPhase: showSandboxPhase,
          preparationStartTime: DateTime(2026, 4, 3, 0, 0, 0),
        ),
      ),
    );
  }

  group('PreparationCard', () {
    testWidgets('无沙箱运行态不展示沙箱启动步骤', (tester) async {
      await tester.pumpWidget(createTestWidget(showSandboxPhase: false));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('沙箱启动中'), findsNothing);
      expect(find.text('Agent 初始化'), findsOneWidget);
    });

    testWidgets('有沙箱运行态展示沙箱启动步骤', (tester) async {
      await tester.pumpWidget(createTestWidget(showSandboxPhase: true));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('沙箱启动中'), findsOneWidget);
    });
  });
}
