import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

@immutable
class SandboxListQuery {
  const SandboxListQuery({this.search, this.bindingType});

  final String? search;
  final String? bindingType;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SandboxListQuery &&
          search == other.search &&
          bindingType == other.bindingType;

  @override
  int get hashCode => Object.hash(search, bindingType);
}

class SandboxListNotifier
    extends AsyncNotifier<PaginatedResponse<SandboxSessionDto>> {
  SandboxListNotifier(this.query);

  final SandboxListQuery query;

  @override
  Future<PaginatedResponse<SandboxSessionDto>> build() {
    return ref
        .read(resourcesApiProvider)
        .listSandboxes(search: query.search, bindingType: query.bindingType);
  }
}

class SandboxStatsNotifier extends AsyncNotifier<SandboxStatsDto> {
  SandboxStatsNotifier(this.sandboxId);

  final String sandboxId;

  @override
  Future<SandboxStatsDto> build() =>
      ref.read(resourcesApiProvider).getSandboxStats(sandboxId);
}

class SandboxLogsNotifier extends AsyncNotifier<List<SandboxLogDto>> {
  SandboxLogsNotifier(this.sandboxId);

  final String sandboxId;

  @override
  Future<List<SandboxLogDto>> build() =>
      ref.read(resourcesApiProvider).getSandboxLogs(sandboxId);
}

final sandboxListProvider =
    AsyncNotifierProvider.family<
      SandboxListNotifier,
      PaginatedResponse<SandboxSessionDto>,
      SandboxListQuery
    >(SandboxListNotifier.new);

final sandboxStatsProvider =
    AsyncNotifierProvider.family<SandboxStatsNotifier, SandboxStatsDto, String>(
      SandboxStatsNotifier.new,
    );

final sandboxLogsProvider =
    AsyncNotifierProvider.family<
      SandboxLogsNotifier,
      List<SandboxLogDto>,
      String
    >(SandboxLogsNotifier.new);
