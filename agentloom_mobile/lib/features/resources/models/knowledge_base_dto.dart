import 'package:freezed_annotation/freezed_annotation.dart';

import 'resource_envelope_decoder.dart';

part 'knowledge_base_dto.freezed.dart';
part 'knowledge_base_dto.g.dart';

@freezed
abstract class KnowledgeBaseDto with _$KnowledgeBaseDto {
  const factory KnowledgeBaseDto({
    required String id,
    required String tenantId,
    required String name,
    String? description,
    @Default('private') String visibility,
    required String createdBy,
    required String embeddingModel,
    String? embeddingModelConfigId,
    @Default(0) int documentCount,
    @Default(0) int nodeCount,
    @Default(0) int chunkCount,
    required String status,
    @Default('manual') String sourceKind,
    required String createdAt,
    required String updatedAt,
  }) = _KnowledgeBaseDto;
  factory KnowledgeBaseDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$KnowledgeBaseDtoFromJson, name: 'KnowledgeBaseDto');
}

@freezed
abstract class KnowledgeDocumentDto with _$KnowledgeDocumentDto {
  const factory KnowledgeDocumentDto({
    required String id,
    required String knowledgeBaseId,
    required String fileName,
    required String mimeType,
    required int sizeBytes,
    required String status,
    String? errorMessage,
    required String createdAt,
    required String updatedAt,
  }) = _KnowledgeDocumentDto;
  factory KnowledgeDocumentDto.fromJson(Map<String, dynamic> json) =>
      decodeResourceDto(json, _$KnowledgeDocumentDtoFromJson, name: 'KnowledgeDocumentDto');
}
