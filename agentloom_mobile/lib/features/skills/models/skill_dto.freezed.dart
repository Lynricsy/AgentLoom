// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'skill_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$SkillDto {
  String get id;
  @JsonKey(name: 'tenant_id')
  String get tenantId;
  String get name;
  String get slug;
  String? get description;
  String? get content;
  Map<String, dynamic>? get frontmatter;
  @JsonKey(name: 'is_builtin')
  bool get isBuiltin;
  String get status;
  @JsonKey(name: 'file_count')
  int get fileCount;
  @JsonKey(name: 'total_size_bytes')
  int get totalSizeBytes;
  int get version;
  @JsonKey(name: 'created_by')
  String? get createdBy;
  @JsonKey(name: 'updated_by')
  String? get updatedBy;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;

  /// Create a copy of SkillDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SkillDtoCopyWith<SkillDto> get copyWith =>
      _$SkillDtoCopyWithImpl<SkillDto>(this as SkillDto, _$identity);

  /// Serializes this SkillDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SkillDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.content, content) || other.content == content) &&
            const DeepCollectionEquality().equals(
              other.frontmatter,
              frontmatter,
            ) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.fileCount, fileCount) ||
                other.fileCount == fileCount) &&
            (identical(other.totalSizeBytes, totalSizeBytes) ||
                other.totalSizeBytes == totalSizeBytes) &&
            (identical(other.version, version) || other.version == version) &&
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
    tenantId,
    name,
    slug,
    description,
    content,
    const DeepCollectionEquality().hash(frontmatter),
    isBuiltin,
    status,
    fileCount,
    totalSizeBytes,
    version,
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'SkillDto(id: $id, tenantId: $tenantId, name: $name, slug: $slug, description: $description, content: $content, frontmatter: $frontmatter, isBuiltin: $isBuiltin, status: $status, fileCount: $fileCount, totalSizeBytes: $totalSizeBytes, version: $version, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $SkillDtoCopyWith<$Res> {
  factory $SkillDtoCopyWith(SkillDto value, $Res Function(SkillDto) _then) =
      _$SkillDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'tenant_id') String tenantId,
    String name,
    String slug,
    String? description,
    String? content,
    Map<String, dynamic>? frontmatter,
    @JsonKey(name: 'is_builtin') bool isBuiltin,
    String status,
    @JsonKey(name: 'file_count') int fileCount,
    @JsonKey(name: 'total_size_bytes') int totalSizeBytes,
    int version,
    @JsonKey(name: 'created_by') String? createdBy,
    @JsonKey(name: 'updated_by') String? updatedBy,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class _$SkillDtoCopyWithImpl<$Res> implements $SkillDtoCopyWith<$Res> {
  _$SkillDtoCopyWithImpl(this._self, this._then);

  final SkillDto _self;
  final $Res Function(SkillDto) _then;

  /// Create a copy of SkillDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? content = freezed,
    Object? frontmatter = freezed,
    Object? isBuiltin = null,
    Object? status = null,
    Object? fileCount = null,
    Object? totalSizeBytes = null,
    Object? version = null,
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
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
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
        content: freezed == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String?,
        frontmatter: freezed == frontmatter
            ? _self.frontmatter
            : frontmatter // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        isBuiltin: null == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        fileCount: null == fileCount
            ? _self.fileCount
            : fileCount // ignore: cast_nullable_to_non_nullable
                  as int,
        totalSizeBytes: null == totalSizeBytes
            ? _self.totalSizeBytes
            : totalSizeBytes // ignore: cast_nullable_to_non_nullable
                  as int,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
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

/// Adds pattern-matching-related methods to [SkillDto].
extension SkillDtoPatterns on SkillDto {
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
    TResult Function(_SkillDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SkillDto() when $default != null:
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
    TResult Function(_SkillDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillDto():
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
    TResult? Function(_SkillDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillDto() when $default != null:
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
      @JsonKey(name: 'tenant_id') String tenantId,
      String name,
      String slug,
      String? description,
      String? content,
      Map<String, dynamic>? frontmatter,
      @JsonKey(name: 'is_builtin') bool isBuiltin,
      String status,
      @JsonKey(name: 'file_count') int fileCount,
      @JsonKey(name: 'total_size_bytes') int totalSizeBytes,
      int version,
      @JsonKey(name: 'created_by') String? createdBy,
      @JsonKey(name: 'updated_by') String? updatedBy,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SkillDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.slug,
          _that.description,
          _that.content,
          _that.frontmatter,
          _that.isBuiltin,
          _that.status,
          _that.fileCount,
          _that.totalSizeBytes,
          _that.version,
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
      @JsonKey(name: 'tenant_id') String tenantId,
      String name,
      String slug,
      String? description,
      String? content,
      Map<String, dynamic>? frontmatter,
      @JsonKey(name: 'is_builtin') bool isBuiltin,
      String status,
      @JsonKey(name: 'file_count') int fileCount,
      @JsonKey(name: 'total_size_bytes') int totalSizeBytes,
      int version,
      @JsonKey(name: 'created_by') String? createdBy,
      @JsonKey(name: 'updated_by') String? updatedBy,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillDto():
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.slug,
          _that.description,
          _that.content,
          _that.frontmatter,
          _that.isBuiltin,
          _that.status,
          _that.fileCount,
          _that.totalSizeBytes,
          _that.version,
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
      @JsonKey(name: 'tenant_id') String tenantId,
      String name,
      String slug,
      String? description,
      String? content,
      Map<String, dynamic>? frontmatter,
      @JsonKey(name: 'is_builtin') bool isBuiltin,
      String status,
      @JsonKey(name: 'file_count') int fileCount,
      @JsonKey(name: 'total_size_bytes') int totalSizeBytes,
      int version,
      @JsonKey(name: 'created_by') String? createdBy,
      @JsonKey(name: 'updated_by') String? updatedBy,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.name,
          _that.slug,
          _that.description,
          _that.content,
          _that.frontmatter,
          _that.isBuiltin,
          _that.status,
          _that.fileCount,
          _that.totalSizeBytes,
          _that.version,
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
class _SkillDto implements SkillDto {
  const _SkillDto({
    required this.id,
    @JsonKey(name: 'tenant_id') required this.tenantId,
    required this.name,
    required this.slug,
    this.description,
    this.content,
    final Map<String, dynamic>? frontmatter,
    @JsonKey(name: 'is_builtin') required this.isBuiltin,
    required this.status,
    @JsonKey(name: 'file_count') required this.fileCount,
    @JsonKey(name: 'total_size_bytes') required this.totalSizeBytes,
    required this.version,
    @JsonKey(name: 'created_by') this.createdBy,
    @JsonKey(name: 'updated_by') this.updatedBy,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
  }) : _frontmatter = frontmatter;
  factory _SkillDto.fromJson(Map<String, dynamic> json) =>
      _$SkillDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'tenant_id')
  final String tenantId;
  @override
  final String name;
  @override
  final String slug;
  @override
  final String? description;
  @override
  final String? content;
  final Map<String, dynamic>? _frontmatter;
  @override
  Map<String, dynamic>? get frontmatter {
    final value = _frontmatter;
    if (value == null) return null;
    if (_frontmatter is EqualUnmodifiableMapView) return _frontmatter;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey(name: 'is_builtin')
  final bool isBuiltin;
  @override
  final String status;
  @override
  @JsonKey(name: 'file_count')
  final int fileCount;
  @override
  @JsonKey(name: 'total_size_bytes')
  final int totalSizeBytes;
  @override
  final int version;
  @override
  @JsonKey(name: 'created_by')
  final String? createdBy;
  @override
  @JsonKey(name: 'updated_by')
  final String? updatedBy;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  /// Create a copy of SkillDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SkillDtoCopyWith<_SkillDto> get copyWith =>
      __$SkillDtoCopyWithImpl<_SkillDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SkillDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SkillDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.content, content) || other.content == content) &&
            const DeepCollectionEquality().equals(
              other._frontmatter,
              _frontmatter,
            ) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.fileCount, fileCount) ||
                other.fileCount == fileCount) &&
            (identical(other.totalSizeBytes, totalSizeBytes) ||
                other.totalSizeBytes == totalSizeBytes) &&
            (identical(other.version, version) || other.version == version) &&
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
    tenantId,
    name,
    slug,
    description,
    content,
    const DeepCollectionEquality().hash(_frontmatter),
    isBuiltin,
    status,
    fileCount,
    totalSizeBytes,
    version,
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'SkillDto(id: $id, tenantId: $tenantId, name: $name, slug: $slug, description: $description, content: $content, frontmatter: $frontmatter, isBuiltin: $isBuiltin, status: $status, fileCount: $fileCount, totalSizeBytes: $totalSizeBytes, version: $version, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$SkillDtoCopyWith<$Res>
    implements $SkillDtoCopyWith<$Res> {
  factory _$SkillDtoCopyWith(_SkillDto value, $Res Function(_SkillDto) _then) =
      __$SkillDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'tenant_id') String tenantId,
    String name,
    String slug,
    String? description,
    String? content,
    Map<String, dynamic>? frontmatter,
    @JsonKey(name: 'is_builtin') bool isBuiltin,
    String status,
    @JsonKey(name: 'file_count') int fileCount,
    @JsonKey(name: 'total_size_bytes') int totalSizeBytes,
    int version,
    @JsonKey(name: 'created_by') String? createdBy,
    @JsonKey(name: 'updated_by') String? updatedBy,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class __$SkillDtoCopyWithImpl<$Res> implements _$SkillDtoCopyWith<$Res> {
  __$SkillDtoCopyWithImpl(this._self, this._then);

  final _SkillDto _self;
  final $Res Function(_SkillDto) _then;

  /// Create a copy of SkillDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? content = freezed,
    Object? frontmatter = freezed,
    Object? isBuiltin = null,
    Object? status = null,
    Object? fileCount = null,
    Object? totalSizeBytes = null,
    Object? version = null,
    Object? createdBy = freezed,
    Object? updatedBy = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _SkillDto(
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
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        content: freezed == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String?,
        frontmatter: freezed == frontmatter
            ? _self._frontmatter
            : frontmatter // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        isBuiltin: null == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        fileCount: null == fileCount
            ? _self.fileCount
            : fileCount // ignore: cast_nullable_to_non_nullable
                  as int,
        totalSizeBytes: null == totalSizeBytes
            ? _self.totalSizeBytes
            : totalSizeBytes // ignore: cast_nullable_to_non_nullable
                  as int,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
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
