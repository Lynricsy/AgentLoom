import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/screens/mcp_servers_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

void main() {
  testWidgets('MCP 服务列表展示空状态并保留导入入口', (tester) async {
    final api = _MockResourcesApi();
    when(() => api.listMcpServerConfigs(
      search: null,
      status: null,
      transportType: null,
      sourceKind: null,
    )).thenAnswer((_) async => const PaginatedResponse(
      data: [],
      meta: PaginationMeta(total: 0, page: 1, pageSize: 20, totalPages: 0),
    ));

    await tester.pumpWidget(ProviderScope(
      overrides: [resourcesApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: McpServersScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('还没有 MCP 服务'), findsOneWidget);
    expect(find.text('导入工具'), findsOneWidget);
  });
}
