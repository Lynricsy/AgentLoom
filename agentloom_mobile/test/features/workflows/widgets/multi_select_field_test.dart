import 'package:agentloom_mobile/features/workflows/widgets/multi_select_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('MultiSelectField', () {
    testWidgets('渲染 FilterChip 选项', (tester) async {
      final field = createTestInputFieldDefinition(
        id: 'msf',
        type: 'multi_select',
        label: '标签',
        description: '选择标签',
        options: ['X', 'Y', 'Z'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MultiSelectField(
              field: field,
              selectedValues: const [],
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.byType(FilterChip), findsNWidgets(3));
      expect(find.text('X'), findsOneWidget);
      expect(find.text('Y'), findsOneWidget);
      expect(find.text('Z'), findsOneWidget);
    });

    testWidgets('点击切换选择状态', (tester) async {
      final field = createTestInputFieldDefinition(
        id: 'msf',
        type: 'multi_select',
        label: '标签',
        options: ['X', 'Y'],
      );
      List<String> captured = [];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return MultiSelectField(
                  field: field,
                  selectedValues: captured,
                  onChanged: (values) {
                    setState(() => captured = values);
                  },
                );
              },
            ),
          ),
        ),
      );
      // 点击 'X'
      await tester.tap(find.text('X'));
      await tester.pumpAndSettle();
      expect(captured, contains('X'));
    });

    testWidgets('显示 description', (tester) async {
      final field = createTestInputFieldDefinition(
        id: 'msf',
        type: 'multi_select',
        label: '分类',
        description: '请选择一个或多个分类',
        options: ['P'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MultiSelectField(
              field: field,
              selectedValues: const [],
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.text('请选择一个或多个分类'), findsOneWidget);
    });

    testWidgets('required=true 无选择时显示错误 (通过 Form validate)', (tester) async {
      final formKey = GlobalKey<FormState>();
      final field = createTestInputFieldDefinition(
        id: 'msf',
        type: 'multi_select',
        label: '标签',
        required: true,
        options: ['A'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Form(
              key: formKey,
              child: MultiSelectField(
                field: field,
                selectedValues: const [],
                onChanged: (_) {},
              ),
            ),
          ),
        ),
      );
      formKey.currentState!.validate();
      await tester.pump();
      expect(find.text('至少需要选择一项'), findsOneWidget);
    });
  });
}
