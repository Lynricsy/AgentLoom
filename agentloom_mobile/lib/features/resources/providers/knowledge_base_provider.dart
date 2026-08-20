import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/paginated_response.dart';
import '../api/resources_api.dart';
import '../models/resource_dtos.dart';

@immutable
class KnowledgeBaseListQuery {
  const KnowledgeBaseListQuery({this.sourceKind});

  final String? sourceKind;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is KnowledgeBaseListQuery && sourceKind == other.sourceKind;

  @override
  int get hashCode => sourceKind.hashCode;
}

class KnowledgeBaseListNotifier
    extends AsyncNotifier<PaginatedResponse<KnowledgeBaseDto>> {
  KnowledgeBaseListNotifier(this.query);

  final KnowledgeBaseListQuery query;

  @override
  Future<PaginatedResponse<KnowledgeBaseDto>> build() {
    return ref
        .read(resourcesApiProvider)
        .listKnowledgeBases(sourceKind: query.sourceKind);
  }
}

class KnowledgeDocumentListNotifier
    extends AsyncNotifier<PaginatedResponse<KnowledgeDocumentDto>> {
  KnowledgeDocumentListNotifier(this.knowledgeBaseId);

  final String knowledgeBaseId;

  @override
  Future<PaginatedResponse<KnowledgeDocumentDto>> build() {
    return ref
        .read(resourcesApiProvider)
        .listKnowledgeDocuments(knowledgeBaseId);
  }
}

final knowledgeBaseListProvider =
    AsyncNotifierProvider.family<
      KnowledgeBaseListNotifier,
      PaginatedResponse<KnowledgeBaseDto>,
      KnowledgeBaseListQuery
    >(KnowledgeBaseListNotifier.new);

final knowledgeDocumentListProvider =
    AsyncNotifierProvider.family<
      KnowledgeDocumentListNotifier,
      PaginatedResponse<KnowledgeDocumentDto>,
      String
    >(KnowledgeDocumentListNotifier.new);
