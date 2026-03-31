// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'workflow_definition_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$WorkflowDefinitionDto {
  String get id;
  String get name;
  String get slug;
  String? get description;
  String? get icon;
  String get status;
  int get version;
  int? get publishedReleaseNumber;
  Map<String, dynamic>? get metadata;
  String? get createdBy;
  String? get updatedBy;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of WorkflowDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $WorkflowDefinitionDtoCopyWith<WorkflowDefinitionDto> get copyWith =>
      _$WorkflowDefinitionDtoCopyWithImpl<WorkflowDefinitionDto>(
        this as WorkflowDefinitionDto,
        _$identity,
      );

  /// Serializes this WorkflowDefinitionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is WorkflowDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.icon, icon) || other.icon == icon) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.publishedReleaseNumber, publishedReleaseNumber) ||
                other.publishedReleaseNumber == publishedReleaseNumber) &&
            const DeepCollectionEquality().equals(other.metadata, metadata) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.updatedBy, updatedBy) ||
                other.updatedBy == updatedBy) &&
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
    slug,
    description,
    icon,
    status,
    version,
    publishedReleaseNumber,
    const DeepCollectionEquality().hash(metadata),
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'WorkflowDefinitionDto(id: $id, name: $name, slug: $slug, description: $description, icon: $icon, status: $status, version: $version, publishedReleaseNumber: $publishedReleaseNumber, metadata: $metadata, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $WorkflowDefinitionDtoCopyWith<$Res> {
  factory $WorkflowDefinitionDtoCopyWith(
    WorkflowDefinitionDto value,
    $Res Function(WorkflowDefinitionDto) _then,
  ) = _$WorkflowDefinitionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    String slug,
    String? description,
    String? icon,
    String status,
    int version,
    int? publishedReleaseNumber,
    Map<String, dynamic>? metadata,
    String? createdBy,
    String? updatedBy,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$WorkflowDefinitionDtoCopyWithImpl<$Res>
    implements $WorkflowDefinitionDtoCopyWith<$Res> {
  _$WorkflowDefinitionDtoCopyWithImpl(this._self, this._then);

  final WorkflowDefinitionDto _self;
  final $Res Function(WorkflowDefinitionDto) _then;

  /// Create a copy of WorkflowDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? icon = freezed,
    Object? status = null,
    Object? version = null,
    Object? publishedReleaseNumber = freezed,
    Object? metadata = freezed,
    Object? createdBy = freezed,
    Object? updatedBy = freezed,
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
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        icon: freezed == icon
            ? _self.icon
            : icon // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
        publishedReleaseNumber: freezed == publishedReleaseNumber
            ? _self.publishedReleaseNumber
            : publishedReleaseNumber // ignore: cast_nullable_to_non_nullable
                  as int?,
        metadata: freezed == metadata
            ? _self.metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedBy: freezed == updatedBy
            ? _self.updatedBy
            : updatedBy // ignore: cast_nullable_to_non_nullable
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

/// Adds pattern-matching-related methods to [WorkflowDefinitionDto].
extension WorkflowDefinitionDtoPatterns on WorkflowDefinitionDto {
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
    TResult Function(_WorkflowDefinitionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto() when $default != null:
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
    TResult Function(_WorkflowDefinitionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto():
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
    TResult? Function(_WorkflowDefinitionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto() when $default != null:
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
      String slug,
      String? description,
      String? icon,
      String status,
      int version,
      int? publishedReleaseNumber,
      Map<String, dynamic>? metadata,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.version,
          _that.publishedReleaseNumber,
          _that.metadata,
          _that.createdBy,
          _that.updatedBy,
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
      String slug,
      String? description,
      String? icon,
      String status,
      int version,
      int? publishedReleaseNumber,
      Map<String, dynamic>? metadata,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto():
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.version,
          _that.publishedReleaseNumber,
          _that.metadata,
          _that.createdBy,
          _that.updatedBy,
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
      String slug,
      String? description,
      String? icon,
      String status,
      int version,
      int? publishedReleaseNumber,
      Map<String, dynamic>? metadata,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.version,
          _that.publishedReleaseNumber,
          _that.metadata,
          _that.createdBy,
          _that.updatedBy,
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
class _WorkflowDefinitionDto implements WorkflowDefinitionDto {
  const _WorkflowDefinitionDto({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.icon,
    required this.status,
    required this.version,
    this.publishedReleaseNumber,
    final Map<String, dynamic>? metadata,
    this.createdBy,
    this.updatedBy,
    required this.createdAt,
    required this.updatedAt,
  }) : _metadata = metadata;
  factory _WorkflowDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$WorkflowDefinitionDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String slug;
  @override
  final String? description;
  @override
  final String? icon;
  @override
  final String status;
  @override
  final int version;
  @override
  final int? publishedReleaseNumber;
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
  final String? createdBy;
  @override
  final String? updatedBy;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of WorkflowDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$WorkflowDefinitionDtoCopyWith<_WorkflowDefinitionDto> get copyWith =>
      __$WorkflowDefinitionDtoCopyWithImpl<_WorkflowDefinitionDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$WorkflowDefinitionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _WorkflowDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.icon, icon) || other.icon == icon) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.publishedReleaseNumber, publishedReleaseNumber) ||
                other.publishedReleaseNumber == publishedReleaseNumber) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.updatedBy, updatedBy) ||
                other.updatedBy == updatedBy) &&
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
    slug,
    description,
    icon,
    status,
    version,
    publishedReleaseNumber,
    const DeepCollectionEquality().hash(_metadata),
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'WorkflowDefinitionDto(id: $id, name: $name, slug: $slug, description: $description, icon: $icon, status: $status, version: $version, publishedReleaseNumber: $publishedReleaseNumber, metadata: $metadata, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$WorkflowDefinitionDtoCopyWith<$Res>
    implements $WorkflowDefinitionDtoCopyWith<$Res> {
  factory _$WorkflowDefinitionDtoCopyWith(
    _WorkflowDefinitionDto value,
    $Res Function(_WorkflowDefinitionDto) _then,
  ) = __$WorkflowDefinitionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String slug,
    String? description,
    String? icon,
    String status,
    int version,
    int? publishedReleaseNumber,
    Map<String, dynamic>? metadata,
    String? createdBy,
    String? updatedBy,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$WorkflowDefinitionDtoCopyWithImpl<$Res>
    implements _$WorkflowDefinitionDtoCopyWith<$Res> {
  __$WorkflowDefinitionDtoCopyWithImpl(this._self, this._then);

  final _WorkflowDefinitionDto _self;
  final $Res Function(_WorkflowDefinitionDto) _then;

  /// Create a copy of WorkflowDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? icon = freezed,
    Object? status = null,
    Object? version = null,
    Object? publishedReleaseNumber = freezed,
    Object? metadata = freezed,
    Object? createdBy = freezed,
    Object? updatedBy = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _WorkflowDefinitionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        icon: freezed == icon
            ? _self.icon
            : icon // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
        publishedReleaseNumber: freezed == publishedReleaseNumber
            ? _self.publishedReleaseNumber
            : publishedReleaseNumber // ignore: cast_nullable_to_non_nullable
                  as int?,
        metadata: freezed == metadata
            ? _self._metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedBy: freezed == updatedBy
            ? _self.updatedBy
            : updatedBy // ignore: cast_nullable_to_non_nullable
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
