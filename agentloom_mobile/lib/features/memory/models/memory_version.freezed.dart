// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'memory_version.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$MemoryVersionDto {
  String get id;
  @JsonKey(name: 'node_id')
  String get nodeId;
  String get content;
  @JsonKey(name: 'version_number')
  int get versionNumber;
  @JsonKey(name: 'change_type')
  String? get changeType;
  bool get deprecated;
  @JsonKey(name: 'created_at')
  String get createdAt;

  /// Create a copy of MemoryVersionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $MemoryVersionDtoCopyWith<MemoryVersionDto> get copyWith =>
      _$MemoryVersionDtoCopyWithImpl<MemoryVersionDto>(
        this as MemoryVersionDto,
        _$identity,
      );

  /// Serializes this MemoryVersionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is MemoryVersionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.versionNumber, versionNumber) ||
                other.versionNumber == versionNumber) &&
            (identical(other.changeType, changeType) ||
                other.changeType == changeType) &&
            (identical(other.deprecated, deprecated) ||
                other.deprecated == deprecated) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    nodeId,
    content,
    versionNumber,
    changeType,
    deprecated,
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryVersionDto(id: $id, nodeId: $nodeId, content: $content, versionNumber: $versionNumber, changeType: $changeType, deprecated: $deprecated, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class $MemoryVersionDtoCopyWith<$Res> {
  factory $MemoryVersionDtoCopyWith(
    MemoryVersionDto value,
    $Res Function(MemoryVersionDto) _then,
  ) = _$MemoryVersionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'node_id') String nodeId,
    String content,
    @JsonKey(name: 'version_number') int versionNumber,
    @JsonKey(name: 'change_type') String? changeType,
    bool deprecated,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class _$MemoryVersionDtoCopyWithImpl<$Res>
    implements $MemoryVersionDtoCopyWith<$Res> {
  _$MemoryVersionDtoCopyWithImpl(this._self, this._then);

  final MemoryVersionDto _self;
  final $Res Function(MemoryVersionDto) _then;

  /// Create a copy of MemoryVersionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? nodeId = null,
    Object? content = null,
    Object? versionNumber = null,
    Object? changeType = freezed,
    Object? deprecated = null,
    Object? createdAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        versionNumber: null == versionNumber
            ? _self.versionNumber
            : versionNumber // ignore: cast_nullable_to_non_nullable
                  as int,
        changeType: freezed == changeType
            ? _self.changeType
            : changeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        deprecated: null == deprecated
            ? _self.deprecated
            : deprecated // ignore: cast_nullable_to_non_nullable
                  as bool,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [MemoryVersionDto].
extension MemoryVersionDtoPatterns on MemoryVersionDto {
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
    TResult Function(_MemoryVersionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto() when $default != null:
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
    TResult Function(_MemoryVersionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto():
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
    TResult? Function(_MemoryVersionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto() when $default != null:
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
      @JsonKey(name: 'node_id') String nodeId,
      String content,
      @JsonKey(name: 'version_number') int versionNumber,
      @JsonKey(name: 'change_type') String? changeType,
      bool deprecated,
      @JsonKey(name: 'created_at') String createdAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto() when $default != null:
        return $default(
          _that.id,
          _that.nodeId,
          _that.content,
          _that.versionNumber,
          _that.changeType,
          _that.deprecated,
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
      @JsonKey(name: 'node_id') String nodeId,
      String content,
      @JsonKey(name: 'version_number') int versionNumber,
      @JsonKey(name: 'change_type') String? changeType,
      bool deprecated,
      @JsonKey(name: 'created_at') String createdAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto():
        return $default(
          _that.id,
          _that.nodeId,
          _that.content,
          _that.versionNumber,
          _that.changeType,
          _that.deprecated,
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
      @JsonKey(name: 'node_id') String nodeId,
      String content,
      @JsonKey(name: 'version_number') int versionNumber,
      @JsonKey(name: 'change_type') String? changeType,
      bool deprecated,
      @JsonKey(name: 'created_at') String createdAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryVersionDto() when $default != null:
        return $default(
          _that.id,
          _that.nodeId,
          _that.content,
          _that.versionNumber,
          _that.changeType,
          _that.deprecated,
          _that.createdAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _MemoryVersionDto implements MemoryVersionDto {
  const _MemoryVersionDto({
    required this.id,
    @JsonKey(name: 'node_id') required this.nodeId,
    required this.content,
    @JsonKey(name: 'version_number') required this.versionNumber,
    @JsonKey(name: 'change_type') this.changeType,
    this.deprecated = false,
    @JsonKey(name: 'created_at') required this.createdAt,
  });
  factory _MemoryVersionDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryVersionDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'node_id')
  final String nodeId;
  @override
  final String content;
  @override
  @JsonKey(name: 'version_number')
  final int versionNumber;
  @override
  @JsonKey(name: 'change_type')
  final String? changeType;
  @override
  @JsonKey()
  final bool deprecated;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;

  /// Create a copy of MemoryVersionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$MemoryVersionDtoCopyWith<_MemoryVersionDto> get copyWith =>
      __$MemoryVersionDtoCopyWithImpl<_MemoryVersionDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$MemoryVersionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _MemoryVersionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.versionNumber, versionNumber) ||
                other.versionNumber == versionNumber) &&
            (identical(other.changeType, changeType) ||
                other.changeType == changeType) &&
            (identical(other.deprecated, deprecated) ||
                other.deprecated == deprecated) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    nodeId,
    content,
    versionNumber,
    changeType,
    deprecated,
    createdAt,
  );

  @override
  String toString() {
    return 'MemoryVersionDto(id: $id, nodeId: $nodeId, content: $content, versionNumber: $versionNumber, changeType: $changeType, deprecated: $deprecated, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class _$MemoryVersionDtoCopyWith<$Res>
    implements $MemoryVersionDtoCopyWith<$Res> {
  factory _$MemoryVersionDtoCopyWith(
    _MemoryVersionDto value,
    $Res Function(_MemoryVersionDto) _then,
  ) = __$MemoryVersionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'node_id') String nodeId,
    String content,
    @JsonKey(name: 'version_number') int versionNumber,
    @JsonKey(name: 'change_type') String? changeType,
    bool deprecated,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class __$MemoryVersionDtoCopyWithImpl<$Res>
    implements _$MemoryVersionDtoCopyWith<$Res> {
  __$MemoryVersionDtoCopyWithImpl(this._self, this._then);

  final _MemoryVersionDto _self;
  final $Res Function(_MemoryVersionDto) _then;

  /// Create a copy of MemoryVersionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? nodeId = null,
    Object? content = null,
    Object? versionNumber = null,
    Object? changeType = freezed,
    Object? deprecated = null,
    Object? createdAt = null,
  }) {
    return _then(
      _MemoryVersionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        versionNumber: null == versionNumber
            ? _self.versionNumber
            : versionNumber // ignore: cast_nullable_to_non_nullable
                  as int,
        changeType: freezed == changeType
            ? _self.changeType
            : changeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        deprecated: null == deprecated
            ? _self.deprecated
            : deprecated // ignore: cast_nullable_to_non_nullable
                  as bool,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}
