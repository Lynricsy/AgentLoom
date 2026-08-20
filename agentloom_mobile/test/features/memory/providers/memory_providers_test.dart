import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/providers/memory_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockMemoryApi api;
  late ProviderContainer container;

  setUp(() {
    api = MockMemoryApi();
    container = ProviderContainer(
      overrides: [memoryApiProvider.overrideWithValue(api)],
    );
  });

  tearDown(() => container.dispose());

  test('memory list loadMore failure preserves loaded instances', () async {
    var callCount = 0;
    final firstPage = createTestMemoryInstanceList(count: 20);
    when(
      () => api.getMemoryInstances(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        sourceKind: any(named: 'sourceKind'),
      ),
    ).thenAnswer((_) async {
      callCount++;
      if (callCount == 1) return firstPage;
      throw Exception('load more failed');
    });

    await container.read(memoryListProvider.future);
    await container.read(memoryListProvider.notifier).loadMore();

    final asyncState = container.read(memoryListProvider);
    expect(asyncState.hasValue, isTrue);
    expect(asyncState.hasError, isFalse);
    expect(asyncState.value!.instances, firstPage);
    expect(asyncState.value!.isLoadingMore, isFalse);
    expect(asyncState.value!.loadMoreError, isA<Exception>());
  });

  test('memory audit loadMore failure preserves loaded entries', () async {
    var callCount = 0;
    final firstPage = createTestMemoryAuditEntryList(count: 20);
    when(
      () => api.getAuditLog(
        'memory-1',
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).thenAnswer((_) async {
      callCount++;
      if (callCount == 1) {
        return (data: firstPage, total: 40, totalPages: 2);
      }
      throw Exception('load more failed');
    });
    await container.read(memoryAuditProvider('memory-1').future);
    await container.read(memoryAuditProvider('memory-1').notifier).loadMore();

    final asyncState = container.read(memoryAuditProvider('memory-1'));
    expect(asyncState.hasValue, isTrue);
    expect(asyncState.hasError, isFalse);
    expect(asyncState.value!.entries, firstPage);
    expect(asyncState.value!.isLoadingMore, isFalse);
    expect(asyncState.value!.loadMoreError, isA<Exception>());
  });

  test('memory audit family keeps instance states independent', () async {
    when(
      () => api.getAuditLog(
        any(),
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).thenAnswer((invocation) async {
      final instanceId = invocation.positionalArguments.single as String;
      return (
        data: [createTestMemoryAuditEntry(id: 'audit-$instanceId')],
        total: 1,
        totalPages: 1,
      );
    });

    final first = await container.read(memoryAuditProvider('memory-1').future);
    final second = await container.read(memoryAuditProvider('memory-2').future);

    expect(first.entries.single.id, 'audit-memory-1');
    expect(second.entries.single.id, 'audit-memory-2');
    expect(
      container.read(memoryAuditProvider('memory-1')).value!.entries.single.id,
      'audit-memory-1',
    );
  });
}
