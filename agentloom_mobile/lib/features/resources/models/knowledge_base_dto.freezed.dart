// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'knowledge_base_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$KnowledgeBaseDto {
  String get id;
  String get tenantId;
  String get name;
  String? get description;
  String get visibility;
  String get createdBy;
  String get embeddingModel;
  String? get embeddingModelConfigId;
  int get documentCount;
  int get nodeCount;
  int get chunkCount;
  String get status;
  String get sourceKind;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of KnowledgeBaseDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $KnowledgeBaseDtoCopyWith<KnowledgeBaseDto> get copyWith =>
      _$KnowledgeBaseDtoCopyWithImpl<KnowledgeBaseDto>(
        this as KnowledgeBaseDto,
        _$identity,
      );

  /// Serializes this KnowledgeBaseDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is KnowledgeBaseDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.visibility, visibility) ||
                other.visibility == visibility) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.embeddingModel, embeddingModel) ||
                other.embeddingModel == embeddingModel) &&
            (identical(other.embeddingModelConfigId, embeddingModelConfigId) ||
                other.embeddingModelConfigId == embeddingModelConfigId) &&
            (identical(other.documentCount, documentCount) ||
                other.documentCount == documentCount) &&
            (identical(other.nodeCount, nodeCount) ||
                other.nodeCount == nodeCount) &&
            (identical(other.chunkCount, chunkCount) ||
                other.chunkCount == chunkCount) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    name,
    description,
    visibility,
    createdBy,
    embeddingModel,
    embeddingModelConfigId,
    documentCount,
    nodeCount,
    chunkCount,
    status,
    sourceKind,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'KnowledgeBaseDto(id: $id, tenantId: $tenantId, name: $name, description: $description, visibility: $visibility, createdBy: $createdBy, embeddingModel: $embeddingModel, embeddingModelConfigId: $embeddingModelConfigId, documentCount: $documentCount, nodeCount: $nodeCount, chunkCount: $chunkCount, status: $status, sourceKind: $sourceKind, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $KnowledgeBaseDtoCopyWith<$Res> {
  factory $KnowledgeBaseDtoCopyWith(
    KnowledgeBaseDto value,
    $Res Function(KnowledgeBaseDto) _then,
  ) = _$KnowledgeBaseDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String tenantId,
    String name,
    String? description,
    String visibility,
    String createdBy,
    String embeddingModel,
    String? embeddingModelConfigId,
    int documentCount,
    int nodeCount,
    int chunkCount,
    String status,
    String sourceKind,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$KnowledgeBaseDtoCopyWithImpl<$Res>
    implements $KnowledgeBaseDtoCopyWith<$Res> {
  _$KnowledgeBaseDtoCopyWithImpl(this._self, this._then);

  final KnowledgeBaseDto _self;
  final $Res Function(KnowledgeBaseDto) _then;

  /// Create a copy of KnowledgeBaseDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? name = null,
    Object? description = freezed,
    Object? visibility = null,
    Object? createdBy = null,
    Object? embeddingModel = null,
    Object? embeddingModelConfigId = freezed,
    Object? documentCount = null,
    Object? nodeCount = null,
    Object? chunkCount = null,
    Object? status = null,
    Object? sourceKind = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        visibility: null == visibility
            ? _self.visibility
            : visibility // ignore: cast_nullable_to_non_nullable
                  as String,
        createdBy: null == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String,
        embeddingModel: null == embeddingModel
            ? _self.embeddingModel
            : embeddingModel // ignore: cast_nullable_to_non_nullable
                  as String,
        embeddingModelConfigId: freezed == embeddingModelConfigId
            ? _self.embeddingModelConfigId
            : embeddingModelConfigId // ignore: cast_nullable_to_non_nullable
                  as String?,
        documentCount: null == documentCount
            ? _self.documentCount
            : documentCount // ignore: cast_nullable_to_non_nullable
                  as int,
        nodeCount: null == nodeCount
            ? _self.nodeCount
            : nodeCount // ignore: cast_nullable_to_non_nullable
                  as int,
        chunkCount: null == chunkCount
            ? _self.chunkCount
            : chunkCount // ignore: cast_nullable_to_non_nullable
                  as int,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [KnowledgeBaseDto].
extension KnowledgeBaseDtoPatterns on KnowledgeBaseDto {
  /// A variant of `map` that fallback to returning `orElse`.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case _:
  ///     return orElse();
  /// }
  /// ```

  @optionalTypeArgs
  TResult maybeMap<TResult extends Object?>(
    TResult Function(_KnowledgeBaseDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto() when $default != null:
        return $default(_that);
      case _:
        return orElse();
    }
  }

  /// A `switch`-like method, using callbacks.
  ///
  /// Callbacks receives the raw object, upcasted.
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case final Subclass2 value:
  ///     return ...;
  /// }
  /// ```

  @optionalTypeArgs
  TResult map<TResult extends Object?>(
    TResult Function(_KnowledgeBaseDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto():
        return $default(_that);
      case _:
        throw StateError('Unexpected subclass');
    }
  }

  /// A variant of `map` that fallback to returning `null`.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case _:
  ///     return null;
  /// }
  /// ```

  @optionalTypeArgs
  TResult? mapOrNull<TResult extends Object?>(
    TResult? Function(_KnowledgeBaseDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto() when $default != null:
        return $default(_that);
      case _:
        return null;
    }
  }

  /// A variant of `when` that fallback to an `orElse` callback.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case _:
  ///     return orElse();
  /// }
  /// ```

  @optionalTypeArgs
  TResult maybeWhen<TResult extends Object?>(
    TResult Function(
      String id,
      String tenantId,
      String name,
      String? description,
      String visibility,
      String createdBy,
      String embeddingModel,
      String? embeddingModelConfigId,
      int documentCount,
      int nodeCount,
      int chunkCount,
      String status,
      String sourceKind,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.description,
          _that.visibility,
          _that.createdBy,
          _that.embeddingModel,
          _that.embeddingModelConfigId,
          _that.documentCount,
          _that.nodeCount,
          _that.chunkCount,
          _that.status,
          _that.sourceKind,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        return orElse();
    }
  }

  /// A `switch`-like method, using callbacks.
  ///
  /// As opposed to `map`, this offers destructuring.
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case Subclass2(:final field2):
  ///     return ...;
  /// }
  /// ```

  @optionalTypeArgs
  TResult when<TResult extends Object?>(
    TResult Function(
      String id,
      String tenantId,
      String name,
      String? description,
      String visibility,
      String createdBy,
      String embeddingModel,
      String? embeddingModelConfigId,
      int documentCount,
      int nodeCount,
      int chunkCount,
      String status,
      String sourceKind,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto():
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.description,
          _that.visibility,
          _that.createdBy,
          _that.embeddingModel,
          _that.embeddingModelConfigId,
          _that.documentCount,
          _that.nodeCount,
          _that.chunkCount,
          _that.status,
          _that.sourceKind,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        throw StateError('Unexpected subclass');
    }
  }

  /// A variant of `when` that fallback to returning `null`
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case _:
  ///     return null;
  /// }
  /// ```

  @optionalTypeArgs
  TResult? whenOrNull<TResult extends Object?>(
    TResult? Function(
      String id,
      String tenantId,
      String name,
      String? description,
      String visibility,
      String createdBy,
      String embeddingModel,
      String? embeddingModelConfigId,
      int documentCount,
      int nodeCount,
      int chunkCount,
      String status,
      String sourceKind,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeBaseDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.description,
          _that.visibility,
          _that.createdBy,
          _that.embeddingModel,
          _that.embeddingModelConfigId,
          _that.documentCount,
          _that.nodeCount,
          _that.chunkCount,
          _that.status,
          _that.sourceKind,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _KnowledgeBaseDto implements KnowledgeBaseDto {
  const _KnowledgeBaseDto({
    required this.id,
    required this.tenantId,
    required this.name,
    this.description,
    this.visibility = 'private',
    required this.createdBy,
    required this.embeddingModel,
    this.embeddingModelConfigId,
    this.documentCount = 0,
    this.nodeCount = 0,
    this.chunkCount = 0,
    required this.status,
    this.sourceKind = 'manual',
    required this.createdAt,
    required this.updatedAt,
  });
  factory _KnowledgeBaseDto.fromJson(Map<String, dynamic> json) =>
      _$KnowledgeBaseDtoFromJson(json);

  @override
  final String id;
  @override
  final String tenantId;
  @override
  final String name;
  @override
  final String? description;
  @override
  @JsonKey()
  final String visibility;
  @override
  final String createdBy;
  @override
  final String embeddingModel;
  @override
  final String? embeddingModelConfigId;
  @override
  @JsonKey()
  final int documentCount;
  @override
  @JsonKey()
  final int nodeCount;
  @override
  @JsonKey()
  final int chunkCount;
  @override
  final String status;
  @override
  @JsonKey()
  final String sourceKind;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of KnowledgeBaseDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$KnowledgeBaseDtoCopyWith<_KnowledgeBaseDto> get copyWith =>
      __$KnowledgeBaseDtoCopyWithImpl<_KnowledgeBaseDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$KnowledgeBaseDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _KnowledgeBaseDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.visibility, visibility) ||
                other.visibility == visibility) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.embeddingModel, embeddingModel) ||
                other.embeddingModel == embeddingModel) &&
            (identical(other.embeddingModelConfigId, embeddingModelConfigId) ||
                other.embeddingModelConfigId == embeddingModelConfigId) &&
            (identical(other.documentCount, documentCount) ||
                other.documentCount == documentCount) &&
            (identical(other.nodeCount, nodeCount) ||
                other.nodeCount == nodeCount) &&
            (identical(other.chunkCount, chunkCount) ||
                other.chunkCount == chunkCount) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    name,
    description,
    visibility,
    createdBy,
    embeddingModel,
    embeddingModelConfigId,
    documentCount,
    nodeCount,
    chunkCount,
    status,
    sourceKind,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'KnowledgeBaseDto(id: $id, tenantId: $tenantId, name: $name, description: $description, visibility: $visibility, createdBy: $createdBy, embeddingModel: $embeddingModel, embeddingModelConfigId: $embeddingModelConfigId, documentCount: $documentCount, nodeCount: $nodeCount, chunkCount: $chunkCount, status: $status, sourceKind: $sourceKind, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$KnowledgeBaseDtoCopyWith<$Res>
    implements $KnowledgeBaseDtoCopyWith<$Res> {
  factory _$KnowledgeBaseDtoCopyWith(
    _KnowledgeBaseDto value,
    $Res Function(_KnowledgeBaseDto) _then,
  ) = __$KnowledgeBaseDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String tenantId,
    String name,
    String? description,
    String visibility,
    String createdBy,
    String embeddingModel,
    String? embeddingModelConfigId,
    int documentCount,
    int nodeCount,
    int chunkCount,
    String status,
    String sourceKind,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$KnowledgeBaseDtoCopyWithImpl<$Res>
    implements _$KnowledgeBaseDtoCopyWith<$Res> {
  __$KnowledgeBaseDtoCopyWithImpl(this._self, this._then);

  final _KnowledgeBaseDto _self;
  final $Res Function(_KnowledgeBaseDto) _then;

  /// Create a copy of KnowledgeBaseDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? name = null,
    Object? description = freezed,
    Object? visibility = null,
    Object? createdBy = null,
    Object? embeddingModel = null,
    Object? embeddingModelConfigId = freezed,
    Object? documentCount = null,
    Object? nodeCount = null,
    Object? chunkCount = null,
    Object? status = null,
    Object? sourceKind = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _KnowledgeBaseDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        visibility: null == visibility
            ? _self.visibility
            : visibility // ignore: cast_nullable_to_non_nullable
                  as String,
        createdBy: null == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String,
        embeddingModel: null == embeddingModel
            ? _self.embeddingModel
            : embeddingModel // ignore: cast_nullable_to_non_nullable
                  as String,
        embeddingModelConfigId: freezed == embeddingModelConfigId
            ? _self.embeddingModelConfigId
            : embeddingModelConfigId // ignore: cast_nullable_to_non_nullable
                  as String?,
        documentCount: null == documentCount
            ? _self.documentCount
            : documentCount // ignore: cast_nullable_to_non_nullable
                  as int,
        nodeCount: null == nodeCount
            ? _self.nodeCount
            : nodeCount // ignore: cast_nullable_to_non_nullable
                  as int,
        chunkCount: null == chunkCount
            ? _self.chunkCount
            : chunkCount // ignore: cast_nullable_to_non_nullable
                  as int,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
mixin _$KnowledgeDocumentDto {
  String get id;
  String get knowledgeBaseId;
  String get fileName;
  String get mimeType;
  int get sizeBytes;
  String get status;
  String? get errorMessage;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of KnowledgeDocumentDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $KnowledgeDocumentDtoCopyWith<KnowledgeDocumentDto> get copyWith =>
      _$KnowledgeDocumentDtoCopyWithImpl<KnowledgeDocumentDto>(
        this as KnowledgeDocumentDto,
        _$identity,
      );

  /// Serializes this KnowledgeDocumentDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is KnowledgeDocumentDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.knowledgeBaseId, knowledgeBaseId) ||
                other.knowledgeBaseId == knowledgeBaseId) &&
            (identical(other.fileName, fileName) ||
                other.fileName == fileName) &&
            (identical(other.mimeType, mimeType) ||
                other.mimeType == mimeType) &&
            (identical(other.sizeBytes, sizeBytes) ||
                other.sizeBytes == sizeBytes) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    knowledgeBaseId,
    fileName,
    mimeType,
    sizeBytes,
    status,
    errorMessage,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'KnowledgeDocumentDto(id: $id, knowledgeBaseId: $knowledgeBaseId, fileName: $fileName, mimeType: $mimeType, sizeBytes: $sizeBytes, status: $status, errorMessage: $errorMessage, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $KnowledgeDocumentDtoCopyWith<$Res> {
  factory $KnowledgeDocumentDtoCopyWith(
    KnowledgeDocumentDto value,
    $Res Function(KnowledgeDocumentDto) _then,
  ) = _$KnowledgeDocumentDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String knowledgeBaseId,
    String fileName,
    String mimeType,
    int sizeBytes,
    String status,
    String? errorMessage,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$KnowledgeDocumentDtoCopyWithImpl<$Res>
    implements $KnowledgeDocumentDtoCopyWith<$Res> {
  _$KnowledgeDocumentDtoCopyWithImpl(this._self, this._then);

  final KnowledgeDocumentDto _self;
  final $Res Function(KnowledgeDocumentDto) _then;

  /// Create a copy of KnowledgeDocumentDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? knowledgeBaseId = null,
    Object? fileName = null,
    Object? mimeType = null,
    Object? sizeBytes = null,
    Object? status = null,
    Object? errorMessage = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        knowledgeBaseId: null == knowledgeBaseId
            ? _self.knowledgeBaseId
            : knowledgeBaseId // ignore: cast_nullable_to_non_nullable
                  as String,
        fileName: null == fileName
            ? _self.fileName
            : fileName // ignore: cast_nullable_to_non_nullable
                  as String,
        mimeType: null == mimeType
            ? _self.mimeType
            : mimeType // ignore: cast_nullable_to_non_nullable
                  as String,
        sizeBytes: null == sizeBytes
            ? _self.sizeBytes
            : sizeBytes // ignore: cast_nullable_to_non_nullable
                  as int,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [KnowledgeDocumentDto].
extension KnowledgeDocumentDtoPatterns on KnowledgeDocumentDto {
  /// A variant of `map` that fallback to returning `orElse`.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case _:
  ///     return orElse();
  /// }
  /// ```

  @optionalTypeArgs
  TResult maybeMap<TResult extends Object?>(
    TResult Function(_KnowledgeDocumentDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto() when $default != null:
        return $default(_that);
      case _:
        return orElse();
    }
  }

  /// A `switch`-like method, using callbacks.
  ///
  /// Callbacks receives the raw object, upcasted.
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case final Subclass2 value:
  ///     return ...;
  /// }
  /// ```

  @optionalTypeArgs
  TResult map<TResult extends Object?>(
    TResult Function(_KnowledgeDocumentDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto():
        return $default(_that);
      case _:
        throw StateError('Unexpected subclass');
    }
  }

  /// A variant of `map` that fallback to returning `null`.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case final Subclass value:
  ///     return ...;
  ///   case _:
  ///     return null;
  /// }
  /// ```

  @optionalTypeArgs
  TResult? mapOrNull<TResult extends Object?>(
    TResult? Function(_KnowledgeDocumentDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto() when $default != null:
        return $default(_that);
      case _:
        return null;
    }
  }

  /// A variant of `when` that fallback to an `orElse` callback.
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case _:
  ///     return orElse();
  /// }
  /// ```

  @optionalTypeArgs
  TResult maybeWhen<TResult extends Object?>(
    TResult Function(
      String id,
      String knowledgeBaseId,
      String fileName,
      String mimeType,
      int sizeBytes,
      String status,
      String? errorMessage,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto() when $default != null:
        return $default(
          _that.id,
          _that.knowledgeBaseId,
          _that.fileName,
          _that.mimeType,
          _that.sizeBytes,
          _that.status,
          _that.errorMessage,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        return orElse();
    }
  }

  /// A `switch`-like method, using callbacks.
  ///
  /// As opposed to `map`, this offers destructuring.
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case Subclass2(:final field2):
  ///     return ...;
  /// }
  /// ```

  @optionalTypeArgs
  TResult when<TResult extends Object?>(
    TResult Function(
      String id,
      String knowledgeBaseId,
      String fileName,
      String mimeType,
      int sizeBytes,
      String status,
      String? errorMessage,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto():
        return $default(
          _that.id,
          _that.knowledgeBaseId,
          _that.fileName,
          _that.mimeType,
          _that.sizeBytes,
          _that.status,
          _that.errorMessage,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        throw StateError('Unexpected subclass');
    }
  }

  /// A variant of `when` that fallback to returning `null`
  ///
  /// It is equivalent to doing:
  /// ```dart
  /// switch (sealedClass) {
  ///   case Subclass(:final field):
  ///     return ...;
  ///   case _:
  ///     return null;
  /// }
  /// ```

  @optionalTypeArgs
  TResult? whenOrNull<TResult extends Object?>(
    TResult? Function(
      String id,
      String knowledgeBaseId,
      String fileName,
      String mimeType,
      int sizeBytes,
      String status,
      String? errorMessage,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _KnowledgeDocumentDto() when $default != null:
        return $default(
          _that.id,
          _that.knowledgeBaseId,
          _that.fileName,
          _that.mimeType,
          _that.sizeBytes,
          _that.status,
          _that.errorMessage,
          _that.createdAt,
          _that.updatedAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _KnowledgeDocumentDto implements KnowledgeDocumentDto {
  const _KnowledgeDocumentDto({
    required this.id,
    required this.knowledgeBaseId,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    required this.status,
    this.errorMessage,
    required this.createdAt,
    required this.updatedAt,
  });
  factory _KnowledgeDocumentDto.fromJson(Map<String, dynamic> json) =>
      _$KnowledgeDocumentDtoFromJson(json);

  @override
  final String id;
  @override
  final String knowledgeBaseId;
  @override
  final String fileName;
  @override
  final String mimeType;
  @override
  final int sizeBytes;
  @override
  final String status;
  @override
  final String? errorMessage;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of KnowledgeDocumentDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$KnowledgeDocumentDtoCopyWith<_KnowledgeDocumentDto> get copyWith =>
      __$KnowledgeDocumentDtoCopyWithImpl<_KnowledgeDocumentDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$KnowledgeDocumentDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _KnowledgeDocumentDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.knowledgeBaseId, knowledgeBaseId) ||
                other.knowledgeBaseId == knowledgeBaseId) &&
            (identical(other.fileName, fileName) ||
                other.fileName == fileName) &&
            (identical(other.mimeType, mimeType) ||
                other.mimeType == mimeType) &&
            (identical(other.sizeBytes, sizeBytes) ||
                other.sizeBytes == sizeBytes) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    knowledgeBaseId,
    fileName,
    mimeType,
    sizeBytes,
    status,
    errorMessage,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'KnowledgeDocumentDto(id: $id, knowledgeBaseId: $knowledgeBaseId, fileName: $fileName, mimeType: $mimeType, sizeBytes: $sizeBytes, status: $status, errorMessage: $errorMessage, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$KnowledgeDocumentDtoCopyWith<$Res>
    implements $KnowledgeDocumentDtoCopyWith<$Res> {
  factory _$KnowledgeDocumentDtoCopyWith(
    _KnowledgeDocumentDto value,
    $Res Function(_KnowledgeDocumentDto) _then,
  ) = __$KnowledgeDocumentDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String knowledgeBaseId,
    String fileName,
    String mimeType,
    int sizeBytes,
    String status,
    String? errorMessage,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$KnowledgeDocumentDtoCopyWithImpl<$Res>
    implements _$KnowledgeDocumentDtoCopyWith<$Res> {
  __$KnowledgeDocumentDtoCopyWithImpl(this._self, this._then);

  final _KnowledgeDocumentDto _self;
  final $Res Function(_KnowledgeDocumentDto) _then;

  /// Create a copy of KnowledgeDocumentDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? knowledgeBaseId = null,
    Object? fileName = null,
    Object? mimeType = null,
    Object? sizeBytes = null,
    Object? status = null,
    Object? errorMessage = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _KnowledgeDocumentDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        knowledgeBaseId: null == knowledgeBaseId
            ? _self.knowledgeBaseId
            : knowledgeBaseId // ignore: cast_nullable_to_non_nullable
                  as String,
        fileName: null == fileName
            ? _self.fileName
            : fileName // ignore: cast_nullable_to_non_nullable
                  as String,
        mimeType: null == mimeType
            ? _self.mimeType
            : mimeType // ignore: cast_nullable_to_non_nullable
                  as String,
        sizeBytes: null == sizeBytes
            ? _self.sizeBytes
            : sizeBytes // ignore: cast_nullable_to_non_nullable
                  as int,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}
