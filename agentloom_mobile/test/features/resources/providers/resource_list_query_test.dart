import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:agentloom_mobile/features/resources/providers/knowledge_base_provider.dart';
import 'package:agentloom_mobile/features/resources/providers/llm_provider.dart';
import 'package:agentloom_mobile/features/resources/providers/mcp_provider.dart';
import 'package:agentloom_mobile/features/resources/providers/sandbox_provider.dart';
import 'package:agentloom_mobile/features/resources/providers/workspace_provider.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

const _emptyWorkspaces = PaginatedResponse<WorkspaceDto>(
  data: [],
  meta: PaginationMeta(total: 0, page: 1, pageSize: 20, totalPages: 0),
);

void main() {
  test('resource list family queries use value equality and stable hashes', () {
    const pairs = <(Object, Object)>[
      (
        WorkspaceListQuery(search: 'team', includeAutoArchived: true),
        WorkspaceListQuery(search: 'team', includeAutoArchived: true),
      ),
      (
        SandboxListQuery(search: 'dev', bindingType: 'conversation'),
        SandboxListQuery(search: 'dev', bindingType: 'conversation'),
      ),
      (
        KnowledgeBaseListQuery(sourceKind: 'manual'),
        KnowledgeBaseListQuery(sourceKind: 'manual'),
      ),
      (
        LlmProviderListQuery(search: 'openai'),
        LlmProviderListQuery(search: 'openai'),
      ),
      (
        McpServerListQuery(
          search: 'git',
          status: 'active',
          transportType: 'stdio',
          sourceKind: 'manual',
        ),
        McpServerListQuery(
          search: 'git',
          status: 'active',
          transportType: 'stdio',
          sourceKind: 'manual',
        ),
      ),
    ];

    for (final pair in pairs) {
      expect(pair.$1, pair.$2);
      expect(pair.$1.hashCode, pair.$2.hashCode);
    }
  });

  test(
    'changing workspace filters selects a new family key and request',
    () async {
      final api = _MockResourcesApi();
      when(
        () => api.listWorkspaces(search: 'first', includeAutoArchived: false),
      ).thenAnswer((_) async => _emptyWorkspaces);
      when(
        () => api.listWorkspaces(search: 'second', includeAutoArchived: true),
      ).thenAnswer((_) async => _emptyWorkspaces);
      final container = ProviderContainer(
        overrides: [resourcesApiProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);

      await container.read(
        workspaceListProvider(const WorkspaceListQuery(search: 'first')).future,
      );
      await container.read(
        workspaceListProvider(
          const WorkspaceListQuery(search: 'second', includeAutoArchived: true),
        ).future,
      );

      verify(
        () => api.listWorkspaces(search: 'first', includeAutoArchived: false),
      ).called(1);
      verify(
        () => api.listWorkspaces(search: 'second', includeAutoArchived: true),
      ).called(1);
    },
  );
}
