// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'agent_definition_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AgentDefinitionDto {
  String get id;
  @JsonKey(name: 'organization_id')
  String get organizationId;
  String get name;
  String? get description;
  String get status;
  @JsonKey(name: 'system_prompt')
  String? get systemPrompt;
  @JsonKey(name: 'model_id')
  String? get modelId;
  @JsonKey(name: 'autonomy_mode')
  String? get autonomyMode;
  @JsonKey(name: 'max_iterations')
  int? get maxIterations;
  @JsonKey(name: 'timeout_seconds')
  int? get timeoutSeconds;
  int? get version;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;
  @JsonKey(name: 'created_by')
  String? get createdBy;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AgentDefinitionDtoCopyWith<AgentDefinitionDto> get copyWith =>
      _$AgentDefinitionDtoCopyWithImpl<AgentDefinitionDto>(
        this as AgentDefinitionDto,
        _$identity,
      );

  /// Serializes this AgentDefinitionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AgentDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.autonomyMode, autonomyMode) ||
                other.autonomyMode == autonomyMode) &&
            (identical(other.maxIterations, maxIterations) ||
                other.maxIterations == maxIterations) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    organizationId,
    name,
    description,
    status,
    systemPrompt,
    modelId,
    autonomyMode,
    maxIterations,
    timeoutSeconds,
    version,
    createdAt,
    updatedAt,
    createdBy,
  );

  @override
  String toString() {
    return 'AgentDefinitionDto(id: $id, organizationId: $organizationId, name: $name, description: $description, status: $status, systemPrompt: $systemPrompt, modelId: $modelId, autonomyMode: $autonomyMode, maxIterations: $maxIterations, timeoutSeconds: $timeoutSeconds, version: $version, createdAt: $createdAt, updatedAt: $updatedAt, createdBy: $createdBy)';
  }
}

/// @nodoc
abstract mixin class $AgentDefinitionDtoCopyWith<$Res> {
  factory $AgentDefinitionDtoCopyWith(
    AgentDefinitionDto value,
    $Res Function(AgentDefinitionDto) _then,
  ) = _$AgentDefinitionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'organization_id') String organizationId,
    String name,
    String? description,
    String status,
    @JsonKey(name: 'system_prompt') String? systemPrompt,
    @JsonKey(name: 'model_id') String? modelId,
    @JsonKey(name: 'autonomy_mode') String? autonomyMode,
    @JsonKey(name: 'max_iterations') int? maxIterations,
    @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
    int? version,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  });
}

/// @nodoc
class _$AgentDefinitionDtoCopyWithImpl<$Res>
    implements $AgentDefinitionDtoCopyWith<$Res> {
  _$AgentDefinitionDtoCopyWithImpl(this._self, this._then);

  final AgentDefinitionDto _self;
  final $Res Function(AgentDefinitionDto) _then;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? status = null,
    Object? systemPrompt = freezed,
    Object? modelId = freezed,
    Object? autonomyMode = freezed,
    Object? maxIterations = freezed,
    Object? timeoutSeconds = freezed,
    Object? version = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? createdBy = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        systemPrompt: freezed == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String?,
        modelId: freezed == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String?,
        autonomyMode: freezed == autonomyMode
            ? _self.autonomyMode
            : autonomyMode // ignore: cast_nullable_to_non_nullable
                  as String?,
        maxIterations: freezed == maxIterations
            ? _self.maxIterations
            : maxIterations // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [AgentDefinitionDto].
extension AgentDefinitionDtoPatterns on AgentDefinitionDto {
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
    TResult Function(_AgentDefinitionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
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
    TResult Function(_AgentDefinitionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto():
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
    TResult? Function(_AgentDefinitionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
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
      @JsonKey(name: 'organization_id') String organizationId,
      String name,
      String? description,
      String status,
      @JsonKey(name: 'system_prompt') String? systemPrompt,
      @JsonKey(name: 'model_id') String? modelId,
      @JsonKey(name: 'autonomy_mode') String? autonomyMode,
      @JsonKey(name: 'max_iterations') int? maxIterations,
      @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
      int? version,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.status,
          _that.systemPrompt,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
          _that.version,
          _that.createdAt,
          _that.updatedAt,
          _that.createdBy,
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
      @JsonKey(name: 'organization_id') String organizationId,
      String name,
      String? description,
      String status,
      @JsonKey(name: 'system_prompt') String? systemPrompt,
      @JsonKey(name: 'model_id') String? modelId,
      @JsonKey(name: 'autonomy_mode') String? autonomyMode,
      @JsonKey(name: 'max_iterations') int? maxIterations,
      @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
      int? version,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto():
        return $default(
          _that.id,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.status,
          _that.systemPrompt,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
          _that.version,
          _that.createdAt,
          _that.updatedAt,
          _that.createdBy,
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
      @JsonKey(name: 'organization_id') String organizationId,
      String name,
      String? description,
      String status,
      @JsonKey(name: 'system_prompt') String? systemPrompt,
      @JsonKey(name: 'model_id') String? modelId,
      @JsonKey(name: 'autonomy_mode') String? autonomyMode,
      @JsonKey(name: 'max_iterations') int? maxIterations,
      @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
      int? version,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.status,
          _that.systemPrompt,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
          _that.version,
          _that.createdAt,
          _that.updatedAt,
          _that.createdBy,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _AgentDefinitionDto implements AgentDefinitionDto {
  const _AgentDefinitionDto({
    required this.id,
    @JsonKey(name: 'organization_id') required this.organizationId,
    required this.name,
    this.description,
    required this.status,
    @JsonKey(name: 'system_prompt') this.systemPrompt,
    @JsonKey(name: 'model_id') this.modelId,
    @JsonKey(name: 'autonomy_mode') this.autonomyMode,
    @JsonKey(name: 'max_iterations') this.maxIterations,
    @JsonKey(name: 'timeout_seconds') this.timeoutSeconds,
    this.version,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
    @JsonKey(name: 'created_by') this.createdBy,
  });
  factory _AgentDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$AgentDefinitionDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'organization_id')
  final String organizationId;
  @override
  final String name;
  @override
  final String? description;
  @override
  final String status;
  @override
  @JsonKey(name: 'system_prompt')
  final String? systemPrompt;
  @override
  @JsonKey(name: 'model_id')
  final String? modelId;
  @override
  @JsonKey(name: 'autonomy_mode')
  final String? autonomyMode;
  @override
  @JsonKey(name: 'max_iterations')
  final int? maxIterations;
  @override
  @JsonKey(name: 'timeout_seconds')
  final int? timeoutSeconds;
  @override
  final int? version;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;
  @override
  @JsonKey(name: 'created_by')
  final String? createdBy;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$AgentDefinitionDtoCopyWith<_AgentDefinitionDto> get copyWith =>
      __$AgentDefinitionDtoCopyWithImpl<_AgentDefinitionDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$AgentDefinitionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _AgentDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.autonomyMode, autonomyMode) ||
                other.autonomyMode == autonomyMode) &&
            (identical(other.maxIterations, maxIterations) ||
                other.maxIterations == maxIterations) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    organizationId,
    name,
    description,
    status,
    systemPrompt,
    modelId,
    autonomyMode,
    maxIterations,
    timeoutSeconds,
    version,
    createdAt,
    updatedAt,
    createdBy,
  );

  @override
  String toString() {
    return 'AgentDefinitionDto(id: $id, organizationId: $organizationId, name: $name, description: $description, status: $status, systemPrompt: $systemPrompt, modelId: $modelId, autonomyMode: $autonomyMode, maxIterations: $maxIterations, timeoutSeconds: $timeoutSeconds, version: $version, createdAt: $createdAt, updatedAt: $updatedAt, createdBy: $createdBy)';
  }
}

/// @nodoc
abstract mixin class _$AgentDefinitionDtoCopyWith<$Res>
    implements $AgentDefinitionDtoCopyWith<$Res> {
  factory _$AgentDefinitionDtoCopyWith(
    _AgentDefinitionDto value,
    $Res Function(_AgentDefinitionDto) _then,
  ) = __$AgentDefinitionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'organization_id') String organizationId,
    String name,
    String? description,
    String status,
    @JsonKey(name: 'system_prompt') String? systemPrompt,
    @JsonKey(name: 'model_id') String? modelId,
    @JsonKey(name: 'autonomy_mode') String? autonomyMode,
    @JsonKey(name: 'max_iterations') int? maxIterations,
    @JsonKey(name: 'timeout_seconds') int? timeoutSeconds,
    int? version,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  });
}

/// @nodoc
class __$AgentDefinitionDtoCopyWithImpl<$Res>
    implements _$AgentDefinitionDtoCopyWith<$Res> {
  __$AgentDefinitionDtoCopyWithImpl(this._self, this._then);

  final _AgentDefinitionDto _self;
  final $Res Function(_AgentDefinitionDto) _then;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? status = null,
    Object? systemPrompt = freezed,
    Object? modelId = freezed,
    Object? autonomyMode = freezed,
    Object? maxIterations = freezed,
    Object? timeoutSeconds = freezed,
    Object? version = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? createdBy = freezed,
  }) {
    return _then(
      _AgentDefinitionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        systemPrompt: freezed == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String?,
        modelId: freezed == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String?,
        autonomyMode: freezed == autonomyMode
            ? _self.autonomyMode
            : autonomyMode // ignore: cast_nullable_to_non_nullable
                  as String?,
        maxIterations: freezed == maxIterations
            ? _self.maxIterations
            : maxIterations // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
