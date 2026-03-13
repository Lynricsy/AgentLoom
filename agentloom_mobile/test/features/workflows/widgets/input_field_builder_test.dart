import 'package:agentloom_mobile/features/workflows/widgets/input_field_builder.dart';
import 'package:agentloom_mobile/features/workflows/widgets/text_input_field.dart';
import 'package:agentloom_mobile/features/workflows/widgets/number_input_field.dart';
import 'package:agentloom_mobile/features/workflows/widgets/single_select_field.dart';
import 'package:agentloom_mobile/features/workflows/widgets/multi_select_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('InputFieldBuilder', () {
    testWidgets('type=text 分发到 TextInputField', (tester) async {
      final field = createTestInputFieldDefinition(type: 'text', label: 'T');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InputFieldBuilder(
              field: field,
              textController: TextEditingController(),
              currentValue: null,
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.byType(TextInputField), findsOneWidget);
    });

    testWidgets('type=number 分发到 NumberInputField', (tester) async {
      final field = createTestInputFieldDefinition(type: 'number', label: 'N');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InputFieldBuilder(
              field: field,
              textController: TextEditingController(),
              currentValue: null,
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.byType(NumberInputField), findsOneWidget);
    });

    testWidgets('type=single_select 分发到 SingleSelectField', (tester) async {
      final field = createTestInputFieldDefinition(
        type: 'single_select',
        label: 'S',
        options: ['A'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InputFieldBuilder(
              field: field,
              currentValue: null,
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.byType(SingleSelectField), findsOneWidget);
    });

    testWidgets('type=multi_select 分发到 MultiSelectField', (tester) async {
      final field = createTestInputFieldDefinition(
        type: 'multi_select',
        label: 'M',
        options: ['X'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InputFieldBuilder(
              field: field,
              currentValue: <String>[],
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.byType(MultiSelectField), findsOneWidget);
    });

    testWidgets('未知 type 返回 SizedBox.shrink', (tester) async {
      final field = createTestInputFieldDefinition(
        type: 'unknown_type',
        label: 'U',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InputFieldBuilder(
              field: field,
              currentValue: null,
              onChanged: (_) {},
            ),
          ),
        ),
      );
      // SizedBox.shrink has 0 width and 0 height
      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox));
      expect(sizedBox.width, 0.0);
      expect(sizedBox.height, 0.0);
    });
  });
}
