// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'memory_node.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$MemoryNodeDto {
  String get id;
  String get instanceId;
  String get contentType;
  Map<String, dynamic>? get metadata;
  int get disclosureLevel;
  String get createdAt;

  /// Create a copy of MemoryNodeDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $MemoryNodeDtoCopyWith<MemoryNodeDto> get copyWith =>
      _$MemoryNodeDtoCopyWithImpl<MemoryNodeDto>(
        this as MemoryNodeDto,
        _$identity,
      );

  /// Serializes this MemoryNodeDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is MemoryNodeDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.instanceId, instanceId) ||
                other.instanceId == instanceId) &&
            (identical(other.contentType, contentType) ||
                other.contentType == contentType) &&
            const DeepCollectionEquality().equals(other.metadata, metadata) &&
            (identical(other.disclosureLevel, disclosureLevel) ||
                other.disclosureLevel == disclosureLevel) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    instanceId,
    contentType,
    const DeepCollectionEquality().hash(metadata),
    disclosureLevel,
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryNodeDto(id: $id, instanceId: $instanceId, contentType: $contentType, metadata: $metadata, disclosureLevel: $disclosureLevel, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class $MemoryNodeDtoCopyWith<$Res> {
  factory $MemoryNodeDtoCopyWith(
    MemoryNodeDto value,
    $Res Function(MemoryNodeDto) _then,
  ) = _$MemoryNodeDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String instanceId,
    String contentType,
    Map<String, dynamic>? metadata,
    int disclosureLevel,
    String createdAt,
  });
}

/// @nodoc
class _$MemoryNodeDtoCopyWithImpl<$Res>
    implements $MemoryNodeDtoCopyWith<$Res> {
  _$MemoryNodeDtoCopyWithImpl(this._self, this._then);

  final MemoryNodeDto _self;
  final $Res Function(MemoryNodeDto) _then;

  /// Create a copy of MemoryNodeDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? instanceId = null,
    Object? contentType = null,
    Object? metadata = freezed,
    Object? disclosureLevel = null,
    Object? createdAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        instanceId: null == instanceId
            ? _self.instanceId
            : instanceId // ignore: cast_nullable_to_non_nullable
                  as String,
        contentType: null == contentType
            ? _self.contentType
            : contentType // ignore: cast_nullable_to_non_nullable
                  as String,
        metadata: freezed == metadata
            ? _self.metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        disclosureLevel: null == disclosureLevel
            ? _self.disclosureLevel
            : disclosureLevel // ignore: cast_nullable_to_non_nullable
                  as int,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [MemoryNodeDto].
extension MemoryNodeDtoPatterns on MemoryNodeDto {
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
    TResult Function(_MemoryNodeDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto() when $default != null:
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
    TResult Function(_MemoryNodeDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto():
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
    TResult? Function(_MemoryNodeDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto() when $default != null:
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
      String instanceId,
      String contentType,
      Map<String, dynamic>? metadata,
      int disclosureLevel,
      String createdAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto() when $default != null:
        return $default(
          _that.id,
          _that.instanceId,
          _that.contentType,
          _that.metadata,
          _that.disclosureLevel,
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
      String instanceId,
      String contentType,
      Map<String, dynamic>? metadata,
      int disclosureLevel,
      String createdAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto():
        return $default(
          _that.id,
          _that.instanceId,
          _that.contentType,
          _that.metadata,
          _that.disclosureLevel,
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
      String instanceId,
      String contentType,
      Map<String, dynamic>? metadata,
      int disclosureLevel,
      String createdAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto() when $default != null:
        return $default(
          _that.id,
          _that.instanceId,
          _that.contentType,
          _that.metadata,
          _that.disclosureLevel,
          _that.createdAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _MemoryNodeDto implements MemoryNodeDto {
  const _MemoryNodeDto({
    required this.id,
    required this.instanceId,
    required this.contentType,
    final Map<String, dynamic>? metadata,
    this.disclosureLevel = 0,
    required this.createdAt,
  }) : _metadata = metadata;
  factory _MemoryNodeDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryNodeDtoFromJson(json);

  @override
  final String id;
  @override
  final String instanceId;
  @override
  final String contentType;
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
  @JsonKey()
  final int disclosureLevel;
  @override
  final String createdAt;

  /// Create a copy of MemoryNodeDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$MemoryNodeDtoCopyWith<_MemoryNodeDto> get copyWith =>
      __$MemoryNodeDtoCopyWithImpl<_MemoryNodeDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$MemoryNodeDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _MemoryNodeDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.instanceId, instanceId) ||
                other.instanceId == instanceId) &&
            (identical(other.contentType, contentType) ||
                other.contentType == contentType) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata) &&
            (identical(other.disclosureLevel, disclosureLevel) ||
                other.disclosureLevel == disclosureLevel) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    instanceId,
    contentType,
    const DeepCollectionEquality().hash(_metadata),
    disclosureLevel,
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryNodeDto(id: $id, instanceId: $instanceId, contentType: $contentType, metadata: $metadata, disclosureLevel: $disclosureLevel, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class _$MemoryNodeDtoCopyWith<$Res>
    implements $MemoryNodeDtoCopyWith<$Res> {
  factory _$MemoryNodeDtoCopyWith(
    _MemoryNodeDto value,
    $Res Function(_MemoryNodeDto) _then,
  ) = __$MemoryNodeDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String instanceId,
    String contentType,
    Map<String, dynamic>? metadata,
    int disclosureLevel,
    String createdAt,
  });
}

/// @nodoc
class __$MemoryNodeDtoCopyWithImpl<$Res>
    implements _$MemoryNodeDtoCopyWith<$Res> {
  __$MemoryNodeDtoCopyWithImpl(this._self, this._then);

  final _MemoryNodeDto _self;
  final $Res Function(_MemoryNodeDto) _then;

  /// Create a copy of MemoryNodeDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? instanceId = null,
    Object? contentType = null,
    Object? metadata = freezed,
    Object? disclosureLevel = null,
    Object? createdAt = null,
  }) {
    return _then(
      _MemoryNodeDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        instanceId: null == instanceId
            ? _self.instanceId
            : instanceId // ignore: cast_nullable_to_non_nullable
                  as String,
        contentType: null == contentType
            ? _self.contentType
            : contentType // ignore: cast_nullable_to_non_nullable
                  as String,
        metadata: freezed == metadata
            ? _self._metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        disclosureLevel: null == disclosureLevel
            ? _self.disclosureLevel
            : disclosureLevel // ignore: cast_nullable_to_non_nullable
                  as int,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}
