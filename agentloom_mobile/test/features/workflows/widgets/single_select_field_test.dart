import 'package:agentloom_mobile/features/workflows/widgets/single_select_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('SingleSelectField', () {
    Widget buildWidget({
      required bool fieldRequired,
      List<String> options = const ['A', 'B', 'C'],
      String? currentValue,
      ValueChanged<String?>? onChanged,
    }) {
      final field = createTestInputFieldDefinition(
        id: 'ssf',
        type: 'single_select',
        label: '选择项',
        description: '请选择一项',
        required: fieldRequired,
        options: options,
      );
      return MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: SingleSelectField(
              field: field,
              currentValue: currentValue,
              onChanged: onChanged ?? (_) {},
            ),
          ),
        ),
      );
    }

    testWidgets('渲染下拉选项', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: false));
      // 打开下拉
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('A'), findsWidgets);
      expect(find.text('B'), findsWidgets);
      expect(find.text('C'), findsWidgets);
    });

    testWidgets('选择触发 onChanged', (tester) async {
      String? selected;
      await tester.pumpWidget(
        buildWidget(fieldRequired: false, onChanged: (v) => selected = v),
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      // 选择 'B'
      await tester.tap(find.text('B').last);
      await tester.pumpAndSettle();
      expect(selected, 'B');
    });

    testWidgets('required=true 渲染 label', (tester) async {
      await tester.pumpWidget(buildWidget(fieldRequired: true));
      expect(find.text('选择项'), findsOneWidget);
    });
  });
}
