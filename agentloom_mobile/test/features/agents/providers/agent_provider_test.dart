import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:agentloom_mobile/features/agents/providers/agent_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  test('loadMore failure preserves loaded agents', () async {
    final api = MockAgentApi();
    var callCount = 0;
    when(
      () => api.listAgents(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        status: any(named: 'status'),
        search: any(named: 'search'),
        sourceKind: any(named: 'sourceKind'),
      ),
    ).thenAnswer((_) async {
      callCount++;
      if (callCount == 1) {
        return createTestAgentList(
          agents: [createTestAgent(id: 'agent-1')],
          total: 2,
          page: 1,
          pageSize: 1,
          totalPages: 2,
        );
      }
      throw Exception('load more failed');
    });
    final container = ProviderContainer(
      overrides: [agentApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    await container.read(agentListProvider.future);
    await container.read(agentListProvider.notifier).loadMore();

    final asyncState = container.read(agentListProvider);
    expect(asyncState.hasValue, isTrue);
    expect(asyncState.hasError, isFalse);
    expect(asyncState.value!.agents.single.id, 'agent-1');
    expect(asyncState.value!.isLoadingMore, isFalse);
    expect(asyncState.value!.loadMoreError, isA<Exception>());
  });
}
