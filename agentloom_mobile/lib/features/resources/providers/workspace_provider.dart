import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

class WorkspaceListNotifier extends AsyncNotifier<PaginatedResponse<WorkspaceDto>> {
  @override
  Future<PaginatedResponse<WorkspaceDto>> build() => ref.read(resourcesApiProvider).listWorkspaces();
}
final workspaceListProvider = AsyncNotifierProvider<WorkspaceListNotifier, PaginatedResponse<WorkspaceDto>>(WorkspaceListNotifier.new);
