import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:agentloom_mobile/features/resources/providers/mcp_provider.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

void main() {
  test('MCP list provider forwards family filters', () async {
    final api = _MockResourcesApi();
    const result = PaginatedResponse<McpServerConfigSummaryDto>(
      data: [],
      meta: PaginationMeta(total: 0, page: 1, pageSize: 20, totalPages: 0),
    );
    when(
      () => api.listMcpServerConfigs(
        search: 'git',
        status: 'active',
        transportType: 'stdio',
        sourceKind: 'manual',
      ),
    ).thenAnswer((_) async => result);
    final container = ProviderContainer(
      overrides: [resourcesApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    final value = await container.read(
      mcpServerListProvider(
        const McpServerListQuery(
          search: 'git',
          status: 'active',
          transportType: 'stdio',
          sourceKind: 'manual',
        ),
      ).future,
    );
    expect(value.data, isEmpty);
    verify(
      () => api.listMcpServerConfigs(
        search: 'git',
        status: 'active',
        transportType: 'stdio',
        sourceKind: 'manual',
      ),
    ).called(1);
  });
}
