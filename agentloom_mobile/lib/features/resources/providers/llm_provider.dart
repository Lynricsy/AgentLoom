import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

@immutable
class LlmProviderListQuery {
  const LlmProviderListQuery({this.search});

  final String? search;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LlmProviderListQuery && search == other.search;

  @override
  int get hashCode => search.hashCode;
}

class LlmProviderListData {
  const LlmProviderListData({required this.providers, required this.models});

  final List<LlmProviderEntityDto> providers;
  final List<LlmModelConfigDto> models;
}

class ProviderDetailData {
  const ProviderDetailData({
    required this.provider,
    required this.models,
    required this.apiKeys,
  });

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
      models: models
          .where((model) => model.providerId == provider.id)
          .toList(growable: false),
      apiKeys: keys,
    );
  }
}

class LlmProvidersNotifier extends AsyncNotifier<LlmProviderListData> {
  LlmProvidersNotifier(this.query);

  final LlmProviderListQuery query;

  @override
  Future<LlmProviderListData> build() async {
    final api = ref.read(resourcesApiProvider);
    final providersFuture = api.listLlmProviderEntities();
    final modelsFuture = api.listLlmModelConfigs();
    final providers = await providersFuture;
    final models = await modelsFuture;
    final search = query.search?.toLowerCase();
    final filtered = search == null || search.isEmpty
        ? providers
        : providers
              .where(
                (provider) =>
                    provider.name.toLowerCase().contains(search) ||
                    provider.slug.toLowerCase().contains(search),
              )
              .toList(growable: false);
    return LlmProviderListData(providers: filtered, models: models);
  }
}

final providerDetailProvider =
    AsyncNotifierProvider.family<
      ProviderDetailNotifier,
      ProviderDetailData,
      String
    >(ProviderDetailNotifier.new);

final llmProvidersProvider =
    AsyncNotifierProvider.family<
      LlmProvidersNotifier,
      LlmProviderListData,
      LlmProviderListQuery
    >(LlmProvidersNotifier.new);
