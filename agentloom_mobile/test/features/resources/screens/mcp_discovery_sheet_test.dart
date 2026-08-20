import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/screens/mcp_discovery_sheet.dart';
import 'package:flutter/material.dart';
import 'package:agentloom_mobile/features/resources/screens/mcp_form_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

void main() {
  testWidgets('凭证输入被遮罩且非法行显示校验错误', (tester) async {
    final api = _MockResourcesApi();
    await tester.pumpWidget(ProviderScope(
      overrides: [resourcesApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: Scaffold(body: McpDiscoverySheet())),
    ));

    final credentialField = find.widgetWithText(TextField, '环境变量（每行 KEY=value）');
    expect(credentialField, findsOneWidget);
    expect(tester.widget<TextField>(credentialField).obscureText, isTrue);
    expect(
      () => parseMcpKeyValueLines('BROKEN_LINE'),
      throwsA(
        isA<McpFormParseException>().having(
          (error) => error.message,
          'message',
          contains('缺少 KEY=value 分隔符'),
        ),
      ),
    );
  });
}
