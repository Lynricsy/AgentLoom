import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:agentloom_mobile/features/resources/providers/llm_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockResourcesApi extends Mock implements ResourcesApi {}

void main() {
  test('provider detail family aggregates provider, matching models and keys', () async {
    final api = _MockResourcesApi();
    const provider = LlmProviderEntityDto(
      id: 'p1', orgId: 'o1', tenantId: 't1', slug: 'custom', name: 'Custom',
      createdAt: 'now', updatedAt: 'now',
    );
    const matching = LlmModelConfigDto(
      id: 'm1', orgId: 'o1', tenantId: 't1', providerId: 'p1', name: 'One', modelId: 'one', createdAt: 'now', updatedAt: 'now',
    );
    const other = LlmModelConfigDto(
      id: 'm2', orgId: 'o1', tenantId: 't1', providerId: 'p2', name: 'Two', modelId: 'two', createdAt: 'now', updatedAt: 'now',
    );
    const key = ApiKeyInfoDto(
      id: 'k1', provider: 'custom', label: 'Key', keyPreview: '***', status: 'active', createdAt: 'now', updatedAt: 'now',
    );
    when(() => api.getLlmProviderEntity('p1')).thenAnswer((_) async => provider);
    when(api.listLlmModelConfigs).thenAnswer((_) async => [matching, other]);
    when(api.listApiKeys).thenAnswer((_) async => [key]);
    final container = ProviderContainer(overrides: [resourcesApiProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);

    final detail = await container.read(providerDetailProvider('p1').future);
    expect(detail.provider, provider);
    expect(detail.models, [matching]);
    expect(detail.apiKeys, [key]);
  });
}
