// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'memory_instance.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$MemoryInstanceDto {
  String get id;
  String get name;
  String? get description;
  @JsonKey(name: 'config')
  Map<String, dynamic>? get config;
  String get status;
  @JsonKey(name: 'node_count')
  int get nodeCount;
  @JsonKey(name: 'edge_count')
  int get edgeCount;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;

  /// Create a copy of MemoryInstanceDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $MemoryInstanceDtoCopyWith<MemoryInstanceDto> get copyWith =>
      _$MemoryInstanceDtoCopyWithImpl<MemoryInstanceDto>(
        this as MemoryInstanceDto,
        _$identity,
      );

  /// Serializes this MemoryInstanceDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is MemoryInstanceDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(other.config, config) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.nodeCount, nodeCount) ||
                other.nodeCount == nodeCount) &&
            (identical(other.edgeCount, edgeCount) ||
                other.edgeCount == edgeCount) &&
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
    name,
    description,
    const DeepCollectionEquality().hash(config),
    status,
    nodeCount,
    edgeCount,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'MemoryInstanceDto(id: $id, name: $name, description: $description, config: $config, status: $status, nodeCount: $nodeCount, edgeCount: $edgeCount, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $MemoryInstanceDtoCopyWith<$Res> {
  factory $MemoryInstanceDtoCopyWith(
    MemoryInstanceDto value,
    $Res Function(MemoryInstanceDto) _then,
  ) = _$MemoryInstanceDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    String? description,
    @JsonKey(name: 'config') Map<String, dynamic>? config,
    String status,
    @JsonKey(name: 'node_count') int nodeCount,
    @JsonKey(name: 'edge_count') int edgeCount,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class _$MemoryInstanceDtoCopyWithImpl<$Res>
    implements $MemoryInstanceDtoCopyWith<$Res> {
  _$MemoryInstanceDtoCopyWithImpl(this._self, this._then);

  final MemoryInstanceDto _self;
  final $Res Function(MemoryInstanceDto) _then;

  /// Create a copy of MemoryInstanceDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = freezed,
    Object? config = freezed,
    Object? status = null,
    Object? nodeCount = null,
    Object? edgeCount = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        config: freezed == config
            ? _self.config
            : config // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeCount: null == nodeCount
            ? _self.nodeCount
            : nodeCount // ignore: cast_nullable_to_non_nullable
                  as int,
        edgeCount: null == edgeCount
            ? _self.edgeCount
            : edgeCount // ignore: cast_nullable_to_non_nullable
                  as int,
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

/// Adds pattern-matching-related methods to [MemoryInstanceDto].
extension MemoryInstanceDtoPatterns on MemoryInstanceDto {
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
    TResult Function(_MemoryInstanceDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto() when $default != null:
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
    TResult Function(_MemoryInstanceDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto():
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
    TResult? Function(_MemoryInstanceDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto() when $default != null:
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
      String name,
      String? description,
      @JsonKey(name: 'config') Map<String, dynamic>? config,
      String status,
      @JsonKey(name: 'node_count') int nodeCount,
      @JsonKey(name: 'edge_count') int edgeCount,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.config,
          _that.status,
          _that.nodeCount,
          _that.edgeCount,
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
      String name,
      String? description,
      @JsonKey(name: 'config') Map<String, dynamic>? config,
      String status,
      @JsonKey(name: 'node_count') int nodeCount,
      @JsonKey(name: 'edge_count') int edgeCount,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto():
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.config,
          _that.status,
          _that.nodeCount,
          _that.edgeCount,
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
      String name,
      String? description,
      @JsonKey(name: 'config') Map<String, dynamic>? config,
      String status,
      @JsonKey(name: 'node_count') int nodeCount,
      @JsonKey(name: 'edge_count') int edgeCount,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryInstanceDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.config,
          _that.status,
          _that.nodeCount,
          _that.edgeCount,
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
class _MemoryInstanceDto implements MemoryInstanceDto {
  const _MemoryInstanceDto({
    required this.id,
    required this.name,
    this.description,
    @JsonKey(name: 'config') final Map<String, dynamic>? config,
    required this.status,
    @JsonKey(name: 'node_count') this.nodeCount = 0,
    @JsonKey(name: 'edge_count') this.edgeCount = 0,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
  }) : _config = config;
  factory _MemoryInstanceDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryInstanceDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String? description;
  final Map<String, dynamic>? _config;
  @override
  @JsonKey(name: 'config')
  Map<String, dynamic>? get config {
    final value = _config;
    if (value == null) return null;
    if (_config is EqualUnmodifiableMapView) return _config;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final String status;
  @override
  @JsonKey(name: 'node_count')
  final int nodeCount;
  @override
  @JsonKey(name: 'edge_count')
  final int edgeCount;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  /// Create a copy of MemoryInstanceDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$MemoryInstanceDtoCopyWith<_MemoryInstanceDto> get copyWith =>
      __$MemoryInstanceDtoCopyWithImpl<_MemoryInstanceDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$MemoryInstanceDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _MemoryInstanceDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(other._config, _config) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.nodeCount, nodeCount) ||
                other.nodeCount == nodeCount) &&
            (identical(other.edgeCount, edgeCount) ||
                other.edgeCount == edgeCount) &&
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
    name,
    description,
    const DeepCollectionEquality().hash(_config),
    status,
    nodeCount,
    edgeCount,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'MemoryInstanceDto(id: $id, name: $name, description: $description, config: $config, status: $status, nodeCount: $nodeCount, edgeCount: $edgeCount, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$MemoryInstanceDtoCopyWith<$Res>
    implements $MemoryInstanceDtoCopyWith<$Res> {
  factory _$MemoryInstanceDtoCopyWith(
    _MemoryInstanceDto value,
    $Res Function(_MemoryInstanceDto) _then,
  ) = __$MemoryInstanceDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String? description,
    @JsonKey(name: 'config') Map<String, dynamic>? config,
    String status,
    @JsonKey(name: 'node_count') int nodeCount,
    @JsonKey(name: 'edge_count') int edgeCount,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class __$MemoryInstanceDtoCopyWithImpl<$Res>
    implements _$MemoryInstanceDtoCopyWith<$Res> {
  __$MemoryInstanceDtoCopyWithImpl(this._self, this._then);

  final _MemoryInstanceDto _self;
  final $Res Function(_MemoryInstanceDto) _then;

  /// Create a copy of MemoryInstanceDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = freezed,
    Object? config = freezed,
    Object? status = null,
    Object? nodeCount = null,
    Object? edgeCount = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _MemoryInstanceDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        config: freezed == config
            ? _self._config
            : config // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeCount: null == nodeCount
            ? _self.nodeCount
            : nodeCount // ignore: cast_nullable_to_non_nullable
                  as int,
        edgeCount: null == edgeCount
            ? _self.edgeCount
            : edgeCount // ignore: cast_nullable_to_non_nullable
                  as int,
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
