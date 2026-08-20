// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'knowledge_base_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_KnowledgeBaseDto _$KnowledgeBaseDtoFromJson(Map<String, dynamic> json) =>
    _KnowledgeBaseDto(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      visibility: json['visibility'] as String? ?? 'private',
      createdBy: json['createdBy'] as String,
      embeddingModel: json['embeddingModel'] as String,
      embeddingModelConfigId: json['embeddingModelConfigId'] as String?,
      documentCount: (json['documentCount'] as num?)?.toInt() ?? 0,
      nodeCount: (json['nodeCount'] as num?)?.toInt() ?? 0,
      chunkCount: (json['chunkCount'] as num?)?.toInt() ?? 0,
      status: json['status'] as String,
      sourceKind: json['sourceKind'] as String? ?? 'manual',
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$KnowledgeBaseDtoToJson(_KnowledgeBaseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tenantId': instance.tenantId,
      'name': instance.name,
      'description': instance.description,
      'visibility': instance.visibility,
      'createdBy': instance.createdBy,
      'embeddingModel': instance.embeddingModel,
      'embeddingModelConfigId': instance.embeddingModelConfigId,
      'documentCount': instance.documentCount,
      'nodeCount': instance.nodeCount,
      'chunkCount': instance.chunkCount,
      'status': instance.status,
      'sourceKind': instance.sourceKind,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };

_KnowledgeDocumentDto _$KnowledgeDocumentDtoFromJson(
  Map<String, dynamic> json,
) => _KnowledgeDocumentDto(
  id: json['id'] as String,
  knowledgeBaseId: json['knowledgeBaseId'] as String,
  fileName: json['fileName'] as String,
  mimeType: json['mimeType'] as String,
  sizeBytes: (json['sizeBytes'] as num).toInt(),
  status: json['status'] as String,
  errorMessage: json['errorMessage'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$KnowledgeDocumentDtoToJson(
  _KnowledgeDocumentDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'knowledgeBaseId': instance.knowledgeBaseId,
  'fileName': instance.fileName,
  'mimeType': instance.mimeType,
  'sizeBytes': instance.sizeBytes,
  'status': instance.status,
  'errorMessage': instance.errorMessage,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};
