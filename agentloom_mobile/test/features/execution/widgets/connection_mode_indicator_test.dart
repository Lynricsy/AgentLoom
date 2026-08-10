import 'package:agentloom_mobile/features/execution/providers/execution_monitor_state.dart';
import 'package:agentloom_mobile/features/execution/widgets/connection_mode_indicator.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ConnectionModeIndicator', () {
    testWidgets('renders green dot for WebSocket mode', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ConnectionModeIndicator(mode: ConnectionMode.websocket),
          ),
        ),
      );

      expect(find.text('WebSocket'), findsOneWidget);
      // 验证绿色圆点
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Colors.green);
      expect(decoration.shape, BoxShape.circle);
    });

    testWidgets('renders amber dot for Reconnecting mode', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ConnectionModeIndicator(mode: ConnectionMode.reconnecting),
          ),
        ),
      );

      expect(find.text('Reconnecting'), findsOneWidget);
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Colors.amber);
    });

    testWidgets('renders orange dot for Polling mode', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ConnectionModeIndicator(mode: ConnectionMode.polling),
          ),
        ),
      );

      expect(find.text('Polling'), findsOneWidget);
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Colors.orange);
    });

    testWidgets('renders red dot for Disconnected mode', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ConnectionModeIndicator(mode: ConnectionMode.disconnected),
          ),
        ),
      );

      expect(find.text('Disconnected'), findsOneWidget);
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Colors.red);
    });
  });
}
