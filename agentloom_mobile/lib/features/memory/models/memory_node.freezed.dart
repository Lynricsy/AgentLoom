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
  @JsonKey(name: 'instance_id')
  String get instanceId;
  String get content;
  @JsonKey(name: 'disclosure_level')
  String? get disclosureLevel;
  @JsonKey(name: 'trigger_keywords')
  List<String> get triggerKeywords;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;

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
            (identical(other.content, content) || other.content == content) &&
            (identical(other.disclosureLevel, disclosureLevel) ||
                other.disclosureLevel == disclosureLevel) &&
            const DeepCollectionEquality().equals(
              other.triggerKeywords,
              triggerKeywords,
            ) &&
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
    instanceId,
    content,
    disclosureLevel,
    const DeepCollectionEquality().hash(triggerKeywords),
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'MemoryNodeDto(id: $id, instanceId: $instanceId, content: $content, disclosureLevel: $disclosureLevel, triggerKeywords: $triggerKeywords, createdAt: $createdAt, updatedAt: $updatedAt)';
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
    @JsonKey(name: 'instance_id') String instanceId,
    String content,
    @JsonKey(name: 'disclosure_level') String? disclosureLevel,
    @JsonKey(name: 'trigger_keywords') List<String> triggerKeywords,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
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
    Object? content = null,
    Object? disclosureLevel = freezed,
    Object? triggerKeywords = null,
    Object? createdAt = null,
    Object? updatedAt = null,
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
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        disclosureLevel: freezed == disclosureLevel
            ? _self.disclosureLevel
            : disclosureLevel // ignore: cast_nullable_to_non_nullable
                  as String?,
        triggerKeywords: null == triggerKeywords
            ? _self.triggerKeywords
            : triggerKeywords // ignore: cast_nullable_to_non_nullable
                  as List<String>,
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
      @JsonKey(name: 'instance_id') String instanceId,
      String content,
      @JsonKey(name: 'disclosure_level') String? disclosureLevel,
      @JsonKey(name: 'trigger_keywords') List<String> triggerKeywords,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
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
          _that.content,
          _that.disclosureLevel,
          _that.triggerKeywords,
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
      @JsonKey(name: 'instance_id') String instanceId,
      String content,
      @JsonKey(name: 'disclosure_level') String? disclosureLevel,
      @JsonKey(name: 'trigger_keywords') List<String> triggerKeywords,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto():
        return $default(
          _that.id,
          _that.instanceId,
          _that.content,
          _that.disclosureLevel,
          _that.triggerKeywords,
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
      @JsonKey(name: 'instance_id') String instanceId,
      String content,
      @JsonKey(name: 'disclosure_level') String? disclosureLevel,
      @JsonKey(name: 'trigger_keywords') List<String> triggerKeywords,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _MemoryNodeDto() when $default != null:
        return $default(
          _that.id,
          _that.instanceId,
          _that.content,
          _that.disclosureLevel,
          _that.triggerKeywords,
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
class _MemoryNodeDto implements MemoryNodeDto {
  const _MemoryNodeDto({
    required this.id,
    @JsonKey(name: 'instance_id') required this.instanceId,
    required this.content,
    @JsonKey(name: 'disclosure_level') this.disclosureLevel,
    @JsonKey(name: 'trigger_keywords')
    final List<String> triggerKeywords = const [],
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
  }) : _triggerKeywords = triggerKeywords;
  factory _MemoryNodeDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryNodeDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'instance_id')
  final String instanceId;
  @override
  final String content;
  @override
  @JsonKey(name: 'disclosure_level')
  final String? disclosureLevel;
  final List<String> _triggerKeywords;
  @override
  @JsonKey(name: 'trigger_keywords')
  List<String> get triggerKeywords {
    if (_triggerKeywords is EqualUnmodifiableListView) return _triggerKeywords;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_triggerKeywords);
  }

  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;

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
            (identical(other.content, content) || other.content == content) &&
            (identical(other.disclosureLevel, disclosureLevel) ||
                other.disclosureLevel == disclosureLevel) &&
            const DeepCollectionEquality().equals(
              other._triggerKeywords,
              _triggerKeywords,
            ) &&
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
    instanceId,
    content,
    disclosureLevel,
    const DeepCollectionEquality().hash(_triggerKeywords),
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'MemoryNodeDto(id: $id, instanceId: $instanceId, content: $content, disclosureLevel: $disclosureLevel, triggerKeywords: $triggerKeywords, createdAt: $createdAt, updatedAt: $updatedAt)';
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
    @JsonKey(name: 'instance_id') String instanceId,
    String content,
    @JsonKey(name: 'disclosure_level') String? disclosureLevel,
    @JsonKey(name: 'trigger_keywords') List<String> triggerKeywords,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
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
    Object? content = null,
    Object? disclosureLevel = freezed,
    Object? triggerKeywords = null,
    Object? createdAt = null,
    Object? updatedAt = null,
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
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        disclosureLevel: freezed == disclosureLevel
            ? _self.disclosureLevel
            : disclosureLevel // ignore: cast_nullable_to_non_nullable
                  as String?,
        triggerKeywords: null == triggerKeywords
            ? _self._triggerKeywords
            : triggerKeywords // ignore: cast_nullable_to_non_nullable
                  as List<String>,
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
