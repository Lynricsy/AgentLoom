import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

class ProviderDetailData {
  const ProviderDetailData({required this.provider, required this.models, required this.apiKeys});
  final LlmProviderEntityDto provider;
  final List<LlmModelConfigDto> models;
  final List<ApiKeyInfoDto> apiKeys;
}

class ProviderDetailNotifier extends AsyncNotifier<ProviderDetailData> {
  ProviderDetailNotifier(this.providerId);
  final String providerId;

  @override
  Future<ProviderDetailData> build() async {
    final api = ref.read(resourcesApiProvider);
    final providerFuture = api.getLlmProviderEntity(providerId);
    final modelsFuture = api.listLlmModelConfigs();
    final keysFuture = api.listApiKeys();
    final provider = await providerFuture;
    final models = await modelsFuture;
    List<ApiKeyInfoDto> keys;
    try {
      keys = await keysFuture;
    } catch (_) {
      keys = const [];
    }
    return ProviderDetailData(
      provider: provider,
      models: models.where((model) => model.providerId == provider.id).toList(growable: false),
      apiKeys: keys,
    );
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await AsyncValue.guard(build);
    if (ref.mounted) state = next;
  }
}

class LlmProvidersNotifier extends AsyncNotifier<List<LlmProviderEntityDto>> {
  @override
  Future<List<LlmProviderEntityDto>> build() => ref.read(resourcesApiProvider).listLlmProviderEntities();

  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await AsyncValue.guard(build);
    if (ref.mounted) state = next;
  }
}

final providerDetailProvider = AsyncNotifierProvider.family<ProviderDetailNotifier, ProviderDetailData, String>(ProviderDetailNotifier.new);
final llmProvidersProvider = AsyncNotifierProvider<LlmProvidersNotifier, List<LlmProviderEntityDto>>(LlmProvidersNotifier.new);
