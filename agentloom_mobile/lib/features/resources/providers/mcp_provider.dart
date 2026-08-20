import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

@immutable
class McpServerListQuery {
  const McpServerListQuery({
    this.search,
    this.status,
    this.transportType,
    this.sourceKind,
  });

  final String? search;
  final String? status;
  final String? transportType;
  final String? sourceKind;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is McpServerListQuery &&
          search == other.search &&
          status == other.status &&
          transportType == other.transportType &&
          sourceKind == other.sourceKind;

  @override
  int get hashCode => Object.hash(search, status, transportType, sourceKind);
}

class McpServerListNotifier
    extends AsyncNotifier<PaginatedResponse<McpServerConfigSummaryDto>> {
  McpServerListNotifier(this.query);

  final McpServerListQuery query;

  @override
  Future<PaginatedResponse<McpServerConfigSummaryDto>> build() {
    return ref
        .read(resourcesApiProvider)
        .listMcpServerConfigs(
          search: query.search,
          status: query.status,
          transportType: query.transportType,
          sourceKind: query.sourceKind,
        );
  }
}

class McpServerDetailNotifier extends AsyncNotifier<McpServerConfigDetailDto> {
  McpServerDetailNotifier(this.configId);

  final String configId;

  @override
  Future<McpServerConfigDetailDto> build() =>
      ref.read(resourcesApiProvider).getMcpServerConfig(configId);
}

final mcpServerListProvider =
    AsyncNotifierProvider.family<
      McpServerListNotifier,
      PaginatedResponse<McpServerConfigSummaryDto>,
      McpServerListQuery
    >(McpServerListNotifier.new);

final mcpServerDetailProvider =
    AsyncNotifierProvider.family<
      McpServerDetailNotifier,
      McpServerConfigDetailDto,
      String
    >(McpServerDetailNotifier.new);

void invalidateMcpResources(Ref ref, {String? configId}) {
  ref.invalidate(mcpServerListProvider);
  if (configId != null) {
    ref.invalidate(mcpServerDetailProvider(configId));
  }
}
