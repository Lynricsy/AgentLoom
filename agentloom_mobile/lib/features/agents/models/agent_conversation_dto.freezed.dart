// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'agent_conversation_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AgentConversationDto {
  String get id;
  @JsonKey(name: 'agent_definition_id')
  String get agentDefinitionId;
  @JsonKey(name: 'organization_id')
  String get organizationId;
  String get status;
  String? get title;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;
  @JsonKey(name: 'created_by')
  String? get createdBy;

  /// Create a copy of AgentConversationDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AgentConversationDtoCopyWith<AgentConversationDto> get copyWith =>
      _$AgentConversationDtoCopyWithImpl<AgentConversationDto>(
        this as AgentConversationDto,
        _$identity,
      );

  /// Serializes this AgentConversationDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AgentConversationDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.agentDefinitionId, agentDefinitionId) ||
                other.agentDefinitionId == agentDefinitionId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.title, title) || other.title == title) &&
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
    agentDefinitionId,
    organizationId,
    status,
    title,
    createdAt,
    updatedAt,
    createdBy,
  );

  @override
  String toString() {
    return 'AgentConversationDto(id: $id, agentDefinitionId: $agentDefinitionId, organizationId: $organizationId, status: $status, title: $title, createdAt: $createdAt, updatedAt: $updatedAt, createdBy: $createdBy)';
  }
}

/// @nodoc
abstract mixin class $AgentConversationDtoCopyWith<$Res> {
  factory $AgentConversationDtoCopyWith(
    AgentConversationDto value,
    $Res Function(AgentConversationDto) _then,
  ) = _$AgentConversationDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'agent_definition_id') String agentDefinitionId,
    @JsonKey(name: 'organization_id') String organizationId,
    String status,
    String? title,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  });
}

/// @nodoc
class _$AgentConversationDtoCopyWithImpl<$Res>
    implements $AgentConversationDtoCopyWith<$Res> {
  _$AgentConversationDtoCopyWithImpl(this._self, this._then);

  final AgentConversationDto _self;
  final $Res Function(AgentConversationDto) _then;

  /// Create a copy of AgentConversationDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? agentDefinitionId = null,
    Object? organizationId = null,
    Object? status = null,
    Object? title = freezed,
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
        agentDefinitionId: null == agentDefinitionId
            ? _self.agentDefinitionId
            : agentDefinitionId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
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

/// Adds pattern-matching-related methods to [AgentConversationDto].
extension AgentConversationDtoPatterns on AgentConversationDto {
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
    TResult Function(_AgentConversationDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto() when $default != null:
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
    TResult Function(_AgentConversationDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto():
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
    TResult? Function(_AgentConversationDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto() when $default != null:
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
      @JsonKey(name: 'agent_definition_id') String agentDefinitionId,
      @JsonKey(name: 'organization_id') String organizationId,
      String status,
      String? title,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto() when $default != null:
        return $default(
          _that.id,
          _that.agentDefinitionId,
          _that.organizationId,
          _that.status,
          _that.title,
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
      @JsonKey(name: 'agent_definition_id') String agentDefinitionId,
      @JsonKey(name: 'organization_id') String organizationId,
      String status,
      String? title,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto():
        return $default(
          _that.id,
          _that.agentDefinitionId,
          _that.organizationId,
          _that.status,
          _that.title,
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
      @JsonKey(name: 'agent_definition_id') String agentDefinitionId,
      @JsonKey(name: 'organization_id') String organizationId,
      String status,
      String? title,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
      @JsonKey(name: 'created_by') String? createdBy,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentConversationDto() when $default != null:
        return $default(
          _that.id,
          _that.agentDefinitionId,
          _that.organizationId,
          _that.status,
          _that.title,
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
class _AgentConversationDto implements AgentConversationDto {
  const _AgentConversationDto({
    required this.id,
    @JsonKey(name: 'agent_definition_id') required this.agentDefinitionId,
    @JsonKey(name: 'organization_id') required this.organizationId,
    required this.status,
    this.title,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
    @JsonKey(name: 'created_by') this.createdBy,
  });
  factory _AgentConversationDto.fromJson(Map<String, dynamic> json) =>
      _$AgentConversationDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'agent_definition_id')
  final String agentDefinitionId;
  @override
  @JsonKey(name: 'organization_id')
  final String organizationId;
  @override
  final String status;
  @override
  final String? title;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;
  @override
  @JsonKey(name: 'created_by')
  final String? createdBy;

  /// Create a copy of AgentConversationDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$AgentConversationDtoCopyWith<_AgentConversationDto> get copyWith =>
      __$AgentConversationDtoCopyWithImpl<_AgentConversationDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$AgentConversationDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _AgentConversationDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.agentDefinitionId, agentDefinitionId) ||
                other.agentDefinitionId == agentDefinitionId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.title, title) || other.title == title) &&
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
    agentDefinitionId,
    organizationId,
    status,
    title,
    createdAt,
    updatedAt,
    createdBy,
  );

  @override
  String toString() {
    return 'AgentConversationDto(id: $id, agentDefinitionId: $agentDefinitionId, organizationId: $organizationId, status: $status, title: $title, createdAt: $createdAt, updatedAt: $updatedAt, createdBy: $createdBy)';
  }
}

/// @nodoc
abstract mixin class _$AgentConversationDtoCopyWith<$Res>
    implements $AgentConversationDtoCopyWith<$Res> {
  factory _$AgentConversationDtoCopyWith(
    _AgentConversationDto value,
    $Res Function(_AgentConversationDto) _then,
  ) = __$AgentConversationDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'agent_definition_id') String agentDefinitionId,
    @JsonKey(name: 'organization_id') String organizationId,
    String status,
    String? title,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
    @JsonKey(name: 'created_by') String? createdBy,
  });
}

/// @nodoc
class __$AgentConversationDtoCopyWithImpl<$Res>
    implements _$AgentConversationDtoCopyWith<$Res> {
  __$AgentConversationDtoCopyWithImpl(this._self, this._then);

  final _AgentConversationDto _self;
  final $Res Function(_AgentConversationDto) _then;

  /// Create a copy of AgentConversationDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? agentDefinitionId = null,
    Object? organizationId = null,
    Object? status = null,
    Object? title = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? createdBy = freezed,
  }) {
    return _then(
      _AgentConversationDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        agentDefinitionId: null == agentDefinitionId
            ? _self.agentDefinitionId
            : agentDefinitionId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
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
