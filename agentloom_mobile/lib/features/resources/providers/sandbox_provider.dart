import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

class SandboxListNotifier extends AsyncNotifier<PaginatedResponse<SandboxSessionDto>> {
  @override
  Future<PaginatedResponse<SandboxSessionDto>> build() => ref.read(resourcesApiProvider).listSandboxes();
}
final sandboxListProvider = AsyncNotifierProvider<SandboxListNotifier, PaginatedResponse<SandboxSessionDto>>(SandboxListNotifier.new);
