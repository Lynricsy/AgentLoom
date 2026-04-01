import 'dart:async';

import 'package:agentloom_mobile/shared/utils/scrolling.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('settleScrollToBottom 会在列表增长后滚动到底部', (tester) async {
    final key = GlobalKey<_ScrollHarnessState>();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(height: 240, child: _ScrollHarness(key: key)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final state = key.currentState!;
    expect(state.controller.offset, 0);

    unawaited(state.expandAndScroll());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 320));
    await tester.pumpAndSettle();

    expect(
      state.controller.offset,
      closeTo(state.controller.position.maxScrollExtent, 1),
    );
    expect(find.text('Item 39'), findsOneWidget);
  });
}

class _ScrollHarness extends StatefulWidget {
  const _ScrollHarness({super.key});

  @override
  State<_ScrollHarness> createState() => _ScrollHarnessState();
}

class _ScrollHarnessState extends State<_ScrollHarness> {
  final ScrollController controller = ScrollController();
  int itemCount = 1;

  Future<void> expandAndScroll() async {
    setState(() {
      itemCount = 40;
    });

    await settleScrollToBottom(controller);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      controller: controller,
      itemCount: itemCount,
      itemBuilder: (context, index) {
        return SizedBox(
          height: 72,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Item $index'),
          ),
        );
      },
    );
  }
}
