import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

@immutable
class WorkspaceListQuery {
  const WorkspaceListQuery({this.search, this.includeAutoArchived = false});

  final String? search;
  final bool includeAutoArchived;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is WorkspaceListQuery &&
          search == other.search &&
          includeAutoArchived == other.includeAutoArchived;

  @override
  int get hashCode => Object.hash(search, includeAutoArchived);
}

class WorkspaceListNotifier
    extends AsyncNotifier<PaginatedResponse<WorkspaceDto>> {
  WorkspaceListNotifier(this.query);

  final WorkspaceListQuery query;

  @override
  Future<PaginatedResponse<WorkspaceDto>> build() {
    return ref
        .read(resourcesApiProvider)
        .listWorkspaces(
          search: query.search,
          includeAutoArchived: query.includeAutoArchived,
        );
  }
}

final workspaceListProvider =
    AsyncNotifierProvider.family<
      WorkspaceListNotifier,
      PaginatedResponse<WorkspaceDto>,
      WorkspaceListQuery
    >(WorkspaceListNotifier.new);
