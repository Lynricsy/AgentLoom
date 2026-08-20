import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

class KnowledgeBaseListNotifier extends AsyncNotifier<PaginatedResponse<KnowledgeBaseDto>> {
  @override
  Future<PaginatedResponse<KnowledgeBaseDto>> build() => ref.read(resourcesApiProvider).listKnowledgeBases();
}
final knowledgeBaseListProvider = AsyncNotifierProvider<KnowledgeBaseListNotifier, PaginatedResponse<KnowledgeBaseDto>>(KnowledgeBaseListNotifier.new);
