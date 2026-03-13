import 'package:agentloom_mobile/features/workflows/widgets/number_input_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('NumberInputField', () {
    Widget buildWidget({
      required bool fieldRequired,
      double? min,
      double? max,
      String? description,
    }) {
      final field = createTestInputFieldDefinition(
        id: 'nf',
        type: 'number',
        label: '数量',
        description: description,
        required: fieldRequired,
        validation: (min != null || max != null)
            ? createTestInputFieldValidation(min: min, max: max)
            : null,
      );
      return MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: NumberInputField(
              field: field,
              controller: TextEditingController(),
              onChanged: (_) {},
            ),
          ),
        ),
      );
    }

    testWidgets('渲染 label', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false));
      expect(find.text('数量'), findsOneWidget);
    });

    testWidgets('required=true 空值显示必填错误', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: true));
      final textField = find.byType(TextFormField);
      await tester.enterText(textField, 'x');
      await tester.pump();
      await tester.enterText(textField, '');
      await tester.pump();
      expect(find.text('此字段为必填项'), findsOneWidget);
    });

    testWidgets('非数字输入显示错误', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false));
      await tester.enterText(find.byType(TextFormField), 'abc');
      await tester.pump();
      expect(find.text('请输入有效数字'), findsOneWidget);
    });

    testWidgets('验证 min 值', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false, min: 10));
      await tester.enterText(find.byType(TextFormField), '5');
      await tester.pump();
      expect(find.text('不能小于 10'), findsOneWidget);
    });

    testWidgets('验证 max 值', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false, max: 20));
      await tester.enterText(find.byType(TextFormField), '25');
      await tester.pump();
      expect(find.text('不能大于 20'), findsOneWidget);
    });

    testWidgets('整数格式化无小数点', (tester) async {
      // min=10.0 应显示 "不能小于 10" 而非 "不能小于 10.0"
      await tester.pumpWidget(buildWidget(fieldRequired: false, min: 10.0));
      await tester.enterText(find.byType(TextFormField), '3');
      await tester.pump();
      expect(find.text('不能小于 10'), findsOneWidget);
      expect(find.text('不能小于 10.0'), findsNothing);
    });
  });
}
