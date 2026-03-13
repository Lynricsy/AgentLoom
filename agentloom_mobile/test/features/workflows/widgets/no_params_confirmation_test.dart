import 'package:agentloom_mobile/features/workflows/widgets/no_params_confirmation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('NoParamsConfirmation', () {
    Widget buildWidget({
      bool isSubmitting = false,
      VoidCallback? onConfirm,
      VoidCallback? onCancel,
    }) {
      return MaterialApp(
        home: Scaffold(
          body: NoParamsConfirmation(
            workflowName: 'My Workflow',
            isSubmitting: isSubmitting,
            onConfirm: onConfirm ?? () {},
            onCancel: onCancel ?? () {},
          ),
        ),
      );
    }

    testWidgets('渲染工作流名称', (tester) async {
      await tester.pumpWidget(buildWidget());
      expect(find.text('My Workflow'), findsOneWidget);
    });

    testWidgets('显示确认消息', (tester) async {
      await tester.pumpWidget(buildWidget());
      expect(find.text('此工作流无需参数输入，是否直接启动？'), findsOneWidget);
    });

    testWidgets('点击启动按钮调用 onConfirm', (tester) async {
      bool called = false;
      await tester.pumpWidget(buildWidget(onConfirm: () => called = true));
      await tester.tap(find.text('启动运行'));
      expect(called, isTrue);
    });

    testWidgets('点击取消按钮调用 onCancel', (tester) async {
      bool called = false;
      await tester.pumpWidget(buildWidget(onCancel: () => called = true));
      await tester.tap(find.text('取消'));
      expect(called, isTrue);
    });

    testWidgets('isSubmitting=true 时按钮禁用', (tester) async {
      bool confirmCalled = false;
      bool cancelCalled = false;
      await tester.pumpWidget(
        buildWidget(
          isSubmitting: true,
          onConfirm: () => confirmCalled = true,
          onCancel: () => cancelCalled = true,
        ),
      );
      await tester.tap(find.text('启动运行'));
      await tester.tap(find.text('取消'));
      expect(confirmCalled, isFalse);
      expect(cancelCalled, isFalse);
    });
  });
}
