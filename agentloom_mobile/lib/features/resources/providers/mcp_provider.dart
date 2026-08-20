import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

typedef McpServerListParams = ({String? search, String? status, String? transportType, String? sourceKind});

class McpServerListNotifier extends AsyncNotifier<PaginatedResponse<McpServerConfigSummaryDto>> {
  McpServerListNotifier(this.params);
  final McpServerListParams params;

  @override
  Future<PaginatedResponse<McpServerConfigSummaryDto>> build() => ref.read(resourcesApiProvider).listMcpServerConfigs(
    search: params.search,
    status: params.status,
    transportType: params.transportType,
    sourceKind: params.sourceKind,
  );

  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await AsyncValue.guard(build);
    if (ref.mounted) state = next;
  }
}

class McpServerDetailNotifier extends AsyncNotifier<McpServerConfigDetailDto> {
  McpServerDetailNotifier(this.configId);
  final String configId;

  @override
  Future<McpServerConfigDetailDto> build() => ref.read(resourcesApiProvider).getMcpServerConfig(configId);

  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await AsyncValue.guard(build);
    if (ref.mounted) state = next;
  }
}

final mcpServerListProvider = AsyncNotifierProvider.family<McpServerListNotifier, PaginatedResponse<McpServerConfigSummaryDto>, McpServerListParams>(McpServerListNotifier.new);
final mcpServerDetailProvider = AsyncNotifierProvider.family<McpServerDetailNotifier, McpServerConfigDetailDto, String>(McpServerDetailNotifier.new);

void invalidateMcpResources(Ref ref, {String? configId}) {
  ref.invalidate(mcpServerListProvider);
  if (configId != null) ref.invalidate(mcpServerDetailProvider(configId));
}
