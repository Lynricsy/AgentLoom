import 'package:agentloom_mobile/features/workflows/widgets/text_input_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('TextInputField', () {
    Widget buildWidget({
      required bool fieldRequired,
      int? minLength,
      int? maxLength,
      String? description,
      ValueChanged<String>? onChanged,
    }) {
      final field = createTestInputFieldDefinition(
        id: 'tf',
        type: 'text',
        label: '标题',
        description: description ?? '请输入标题',
        required: fieldRequired,
        validation: (minLength != null || maxLength != null)
            ? createTestInputFieldValidation(
                minLength: minLength,
                maxLength: maxLength,
              )
            : null,
      );
      return MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: TextInputField(
              field: field,
              controller: TextEditingController(),
              onChanged: onChanged ?? (_) {},
            ),
          ),
        ),
      );
    }

    testWidgets('渲染 label 和 description', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false));
      expect(find.text('标题'), findsOneWidget);
      expect(find.text('请输入标题'), findsOneWidget);
    });

    testWidgets('required=true 空值显示必填错误', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: true));
      final textField = find.byType(TextFormField);
      // 输入后清空触发 autovalidate
      await tester.enterText(textField, 'a');
      await tester.pump();
      await tester.enterText(textField, '');
      await tester.pump();
      expect(find.text('此字段为必填项'), findsOneWidget);
    });

    testWidgets('验证 minLength', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false, minLength: 5));
      final textField = find.byType(TextFormField);
      await tester.enterText(textField, 'ab');
      await tester.pump();
      expect(find.text('至少需要 5 个字符'), findsOneWidget);
    });

    testWidgets('maxLength > 200 时显示多行', (tester) async {
      await tester.pumpWidget(
        buildWidget(fieldRequired: false, maxLength: 500),
      );
      // TextFormField 内部包装 TextField，maxLines 在 TextField 上
      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.maxLines, 5);
    });

    testWidgets('调用 onChanged', (tester) async {
      String? captured;
      await tester.pumpWidget(
        buildWidget(fieldRequired: false, onChanged: (v) => captured = v),
      );
      await tester.enterText(find.byType(TextFormField), 'hello');
      await tester.pump();
      expect(captured, 'hello');
    });
  });
}
