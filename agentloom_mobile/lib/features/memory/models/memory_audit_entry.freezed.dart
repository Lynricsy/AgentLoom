// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'memory_audit_entry.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$MemoryAuditEntryDto {
  String get id;
  String get action;
  String get userId;
  String? get targetNodeId;
  String? get targetVersionId;
  Map<String, dynamic>? get metadata;
  DateTime get createdAt;

  /// Create a copy of MemoryAuditEntryDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $MemoryAuditEntryDtoCopyWith<MemoryAuditEntryDto> get copyWith =>
      _$MemoryAuditEntryDtoCopyWithImpl<MemoryAuditEntryDto>(
        this as MemoryAuditEntryDto,
        _$identity,
      );

  /// Serializes this MemoryAuditEntryDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is MemoryAuditEntryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.targetNodeId, targetNodeId) ||
                other.targetNodeId == targetNodeId) &&
            (identical(other.targetVersionId, targetVersionId) ||
                other.targetVersionId == targetVersionId) &&
            const DeepCollectionEquality().equals(other.metadata, metadata) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    action,
    userId,
    targetNodeId,
    targetVersionId,
    const DeepCollectionEquality().hash(metadata),
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryAuditEntryDto(id: $id, action: $action, userId: $userId, targetNodeId: $targetNodeId, targetVersionId: $targetVersionId, metadata: $metadata, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class $MemoryAuditEntryDtoCopyWith<$Res> {
  factory $MemoryAuditEntryDtoCopyWith(
    MemoryAuditEntryDto value,
    $Res Function(MemoryAuditEntryDto) _then,
  ) = _$MemoryAuditEntryDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String action,
    String userId,
    String? targetNodeId,
    String? targetVersionId,
    Map<String, dynamic>? metadata,
    DateTime createdAt,
  });
}

/// @nodoc
class _$MemoryAuditEntryDtoCopyWithImpl<$Res>
    implements $MemoryAuditEntryDtoCopyWith<$Res> {
  _$MemoryAuditEntryDtoCopyWithImpl(this._self, this._then);

  final MemoryAuditEntryDto _self;
  final $Res Function(MemoryAuditEntryDto) _then;

  /// Create a copy of MemoryAuditEntryDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? action = null,
    Object? userId = null,
    Object? targetNodeId = freezed,
    Object? targetVersionId = freezed,
    Object? metadata = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        action: null == action
            ? _self.action
            : action // ignore: cast_nullable_to_non_nullable
                  as String,
        userId: null == userId
            ? _self.userId
            : userId // ignore: cast_nullable_to_non_nullable
                  as String,
        targetNodeId: freezed == targetNodeId
            ? _self.targetNodeId
            : targetNodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetVersionId: freezed == targetVersionId
            ? _self.targetVersionId
            : targetVersionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        metadata: freezed == metadata
            ? _self.metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [MemoryAuditEntryDto].
extension MemoryAuditEntryDtoPatterns on MemoryAuditEntryDto {
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
    TResult Function(_MemoryAuditEntryDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto() when $default != null:
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
    TResult Function(_MemoryAuditEntryDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto():
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
    TResult? Function(_MemoryAuditEntryDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto() when $default != null:
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
      String action,
      String userId,
      String? targetNodeId,
      String? targetVersionId,
      Map<String, dynamic>? metadata,
      DateTime createdAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto() when $default != null:
        return $default(
          _that.id,
          _that.action,
          _that.userId,
          _that.targetNodeId,
          _that.targetVersionId,
          _that.metadata,
          _that.createdAt,
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
      String action,
      String userId,
      String? targetNodeId,
      String? targetVersionId,
      Map<String, dynamic>? metadata,
      DateTime createdAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto():
        return $default(
          _that.id,
          _that.action,
          _that.userId,
          _that.targetNodeId,
          _that.targetVersionId,
          _that.metadata,
          _that.createdAt,
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
      String action,
      String userId,
      String? targetNodeId,
      String? targetVersionId,
      Map<String, dynamic>? metadata,
      DateTime createdAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryAuditEntryDto() when $default != null:
        return $default(
          _that.id,
          _that.action,
          _that.userId,
          _that.targetNodeId,
          _that.targetVersionId,
          _that.metadata,
          _that.createdAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _MemoryAuditEntryDto implements MemoryAuditEntryDto {
  const _MemoryAuditEntryDto({
    required this.id,
    required this.action,
    required this.userId,
    this.targetNodeId,
    this.targetVersionId,
    final Map<String, dynamic>? metadata,
    required this.createdAt,
  }) : _metadata = metadata;
  factory _MemoryAuditEntryDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryAuditEntryDtoFromJson(json);

  @override
  final String id;
  @override
  final String action;
  @override
  final String userId;
  @override
  final String? targetNodeId;
  @override
  final String? targetVersionId;
  final Map<String, dynamic>? _metadata;
  @override
  Map<String, dynamic>? get metadata {
    final value = _metadata;
    if (value == null) return null;
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final DateTime createdAt;

  /// Create a copy of MemoryAuditEntryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$MemoryAuditEntryDtoCopyWith<_MemoryAuditEntryDto> get copyWith =>
      __$MemoryAuditEntryDtoCopyWithImpl<_MemoryAuditEntryDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$MemoryAuditEntryDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _MemoryAuditEntryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.targetNodeId, targetNodeId) ||
                other.targetNodeId == targetNodeId) &&
            (identical(other.targetVersionId, targetVersionId) ||
                other.targetVersionId == targetVersionId) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    action,
    userId,
    targetNodeId,
    targetVersionId,
    const DeepCollectionEquality().hash(_metadata),
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryAuditEntryDto(id: $id, action: $action, userId: $userId, targetNodeId: $targetNodeId, targetVersionId: $targetVersionId, metadata: $metadata, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class _$MemoryAuditEntryDtoCopyWith<$Res>
    implements $MemoryAuditEntryDtoCopyWith<$Res> {
  factory _$MemoryAuditEntryDtoCopyWith(
    _MemoryAuditEntryDto value,
    $Res Function(_MemoryAuditEntryDto) _then,
  ) = __$MemoryAuditEntryDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String action,
    String userId,
    String? targetNodeId,
    String? targetVersionId,
    Map<String, dynamic>? metadata,
    DateTime createdAt,
  });
}

/// @nodoc
class __$MemoryAuditEntryDtoCopyWithImpl<$Res>
    implements _$MemoryAuditEntryDtoCopyWith<$Res> {
  __$MemoryAuditEntryDtoCopyWithImpl(this._self, this._then);

  final _MemoryAuditEntryDto _self;
  final $Res Function(_MemoryAuditEntryDto) _then;

  /// Create a copy of MemoryAuditEntryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? action = null,
    Object? userId = null,
    Object? targetNodeId = freezed,
    Object? targetVersionId = freezed,
    Object? metadata = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _MemoryAuditEntryDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        action: null == action
            ? _self.action
            : action // ignore: cast_nullable_to_non_nullable
                  as String,
        userId: null == userId
            ? _self.userId
            : userId // ignore: cast_nullable_to_non_nullable
                  as String,
        targetNodeId: freezed == targetNodeId
            ? _self.targetNodeId
            : targetNodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetVersionId: freezed == targetVersionId
            ? _self.targetVersionId
            : targetVersionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        metadata: freezed == metadata
            ? _self._metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as DateTime,
      ),
    );
  }
}
