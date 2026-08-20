// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'workspace_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$WorkspaceDto {
  String get id;
  String get name;
  String? get description;
  String get storageKey;
  int? get sizeBytes;
  String get status;
  Map<String, dynamic>? get config;
  String get sourceKind;
  bool get isAutoArchived;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of WorkspaceDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $WorkspaceDtoCopyWith<WorkspaceDto> get copyWith =>
      _$WorkspaceDtoCopyWithImpl<WorkspaceDto>(
        this as WorkspaceDto,
        _$identity,
      );

  /// Serializes this WorkspaceDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is WorkspaceDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.storageKey, storageKey) ||
                other.storageKey == storageKey) &&
            (identical(other.sizeBytes, sizeBytes) ||
                other.sizeBytes == sizeBytes) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other.config, config) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind) &&
            (identical(other.isAutoArchived, isAutoArchived) ||
                other.isAutoArchived == isAutoArchived) &&
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
    storageKey,
    sizeBytes,
    status,
    const DeepCollectionEquality().hash(config),
    sourceKind,
    isAutoArchived,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'WorkspaceDto(id: $id, name: $name, description: $description, storageKey: $storageKey, sizeBytes: $sizeBytes, status: $status, config: $config, sourceKind: $sourceKind, isAutoArchived: $isAutoArchived, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $WorkspaceDtoCopyWith<$Res> {
  factory $WorkspaceDtoCopyWith(
    WorkspaceDto value,
    $Res Function(WorkspaceDto) _then,
  ) = _$WorkspaceDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    String? description,
    String storageKey,
    int? sizeBytes,
    String status,
    Map<String, dynamic>? config,
    String sourceKind,
    bool isAutoArchived,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$WorkspaceDtoCopyWithImpl<$Res> implements $WorkspaceDtoCopyWith<$Res> {
  _$WorkspaceDtoCopyWithImpl(this._self, this._then);

  final WorkspaceDto _self;
  final $Res Function(WorkspaceDto) _then;

  /// Create a copy of WorkspaceDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = freezed,
    Object? storageKey = null,
    Object? sizeBytes = freezed,
    Object? status = null,
    Object? config = freezed,
    Object? sourceKind = null,
    Object? isAutoArchived = null,
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
        storageKey: null == storageKey
            ? _self.storageKey
            : storageKey // ignore: cast_nullable_to_non_nullable
                  as String,
        sizeBytes: freezed == sizeBytes
            ? _self.sizeBytes
            : sizeBytes // ignore: cast_nullable_to_non_nullable
                  as int?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        config: freezed == config
            ? _self.config
            : config // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
        isAutoArchived: null == isAutoArchived
            ? _self.isAutoArchived
            : isAutoArchived // ignore: cast_nullable_to_non_nullable
                  as bool,
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

/// Adds pattern-matching-related methods to [WorkspaceDto].
extension WorkspaceDtoPatterns on WorkspaceDto {
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
    TResult Function(_WorkspaceDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto() when $default != null:
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
    TResult Function(_WorkspaceDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto():
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
    TResult? Function(_WorkspaceDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto() when $default != null:
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
      String storageKey,
      int? sizeBytes,
      String status,
      Map<String, dynamic>? config,
      String sourceKind,
      bool isAutoArchived,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.storageKey,
          _that.sizeBytes,
          _that.status,
          _that.config,
          _that.sourceKind,
          _that.isAutoArchived,
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
      String storageKey,
      int? sizeBytes,
      String status,
      Map<String, dynamic>? config,
      String sourceKind,
      bool isAutoArchived,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto():
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.storageKey,
          _that.sizeBytes,
          _that.status,
          _that.config,
          _that.sourceKind,
          _that.isAutoArchived,
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
      String storageKey,
      int? sizeBytes,
      String status,
      Map<String, dynamic>? config,
      String sourceKind,
      bool isAutoArchived,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkspaceDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.description,
          _that.storageKey,
          _that.sizeBytes,
          _that.status,
          _that.config,
          _that.sourceKind,
          _that.isAutoArchived,
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
class _WorkspaceDto extends WorkspaceDto {
  const _WorkspaceDto({
    required this.id,
    required this.name,
    this.description,
    required this.storageKey,
    this.sizeBytes,
    required this.status,
    final Map<String, dynamic>? config,
    this.sourceKind = 'manual',
    this.isAutoArchived = false,
    required this.createdAt,
    required this.updatedAt,
  }) : _config = config,
       super._();
  factory _WorkspaceDto.fromJson(Map<String, dynamic> json) =>
      _$WorkspaceDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String? description;
  @override
  final String storageKey;
  @override
  final int? sizeBytes;
  @override
  final String status;
  final Map<String, dynamic>? _config;
  @override
  Map<String, dynamic>? get config {
    final value = _config;
    if (value == null) return null;
    if (_config is EqualUnmodifiableMapView) return _config;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey()
  final String sourceKind;
  @override
  @JsonKey()
  final bool isAutoArchived;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of WorkspaceDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$WorkspaceDtoCopyWith<_WorkspaceDto> get copyWith =>
      __$WorkspaceDtoCopyWithImpl<_WorkspaceDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$WorkspaceDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _WorkspaceDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.storageKey, storageKey) ||
                other.storageKey == storageKey) &&
            (identical(other.sizeBytes, sizeBytes) ||
                other.sizeBytes == sizeBytes) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other._config, _config) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind) &&
            (identical(other.isAutoArchived, isAutoArchived) ||
                other.isAutoArchived == isAutoArchived) &&
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
    storageKey,
    sizeBytes,
    status,
    const DeepCollectionEquality().hash(_config),
    sourceKind,
    isAutoArchived,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'WorkspaceDto(id: $id, name: $name, description: $description, storageKey: $storageKey, sizeBytes: $sizeBytes, status: $status, config: $config, sourceKind: $sourceKind, isAutoArchived: $isAutoArchived, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$WorkspaceDtoCopyWith<$Res>
    implements $WorkspaceDtoCopyWith<$Res> {
  factory _$WorkspaceDtoCopyWith(
    _WorkspaceDto value,
    $Res Function(_WorkspaceDto) _then,
  ) = __$WorkspaceDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String? description,
    String storageKey,
    int? sizeBytes,
    String status,
    Map<String, dynamic>? config,
    String sourceKind,
    bool isAutoArchived,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$WorkspaceDtoCopyWithImpl<$Res>
    implements _$WorkspaceDtoCopyWith<$Res> {
  __$WorkspaceDtoCopyWithImpl(this._self, this._then);

  final _WorkspaceDto _self;
  final $Res Function(_WorkspaceDto) _then;

  /// Create a copy of WorkspaceDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? description = freezed,
    Object? storageKey = null,
    Object? sizeBytes = freezed,
    Object? status = null,
    Object? config = freezed,
    Object? sourceKind = null,
    Object? isAutoArchived = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _WorkspaceDto(
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
        storageKey: null == storageKey
            ? _self.storageKey
            : storageKey // ignore: cast_nullable_to_non_nullable
                  as String,
        sizeBytes: freezed == sizeBytes
            ? _self.sizeBytes
            : sizeBytes // ignore: cast_nullable_to_non_nullable
                  as int?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        config: freezed == config
            ? _self._config
            : config // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
        isAutoArchived: null == isAutoArchived
            ? _self.isAutoArchived
            : isAutoArchived // ignore: cast_nullable_to_non_nullable
                  as bool,
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
