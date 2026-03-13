// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'workflow_input_schema.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$WorkflowInputSchema {
  int get version;
  @JsonKey(name: 'collection_mode')
  String get collectionMode;
  List<InputFieldDefinition> get fields;

  /// Create a copy of WorkflowInputSchema
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $WorkflowInputSchemaCopyWith<WorkflowInputSchema> get copyWith =>
      _$WorkflowInputSchemaCopyWithImpl<WorkflowInputSchema>(
        this as WorkflowInputSchema,
        _$identity,
      );

  /// Serializes this WorkflowInputSchema to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is WorkflowInputSchema &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.collectionMode, collectionMode) ||
                other.collectionMode == collectionMode) &&
            const DeepCollectionEquality().equals(other.fields, fields));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    version,
    collectionMode,
    const DeepCollectionEquality().hash(fields),
  );

  @override
  String toString() {
    return 'WorkflowInputSchema(version: $version, collectionMode: $collectionMode, fields: $fields)';
  }
}

/// @nodoc
abstract mixin class $WorkflowInputSchemaCopyWith<$Res> {
  factory $WorkflowInputSchemaCopyWith(
    WorkflowInputSchema value,
    $Res Function(WorkflowInputSchema) _then,
  ) = _$WorkflowInputSchemaCopyWithImpl;
  @useResult
  $Res call({
    int version,
    @JsonKey(name: 'collection_mode') String collectionMode,
    List<InputFieldDefinition> fields,
  });
}

/// @nodoc
class _$WorkflowInputSchemaCopyWithImpl<$Res>
    implements $WorkflowInputSchemaCopyWith<$Res> {
  _$WorkflowInputSchemaCopyWithImpl(this._self, this._then);

  final WorkflowInputSchema _self;
  final $Res Function(WorkflowInputSchema) _then;

  /// Create a copy of WorkflowInputSchema
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? version = null,
    Object? collectionMode = null,
    Object? fields = null,
  }) {
    return _then(
      _self.copyWith(
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
        collectionMode: null == collectionMode
            ? _self.collectionMode
            : collectionMode // ignore: cast_nullable_to_non_nullable
                  as String,
        fields: null == fields
            ? _self.fields
            : fields // ignore: cast_nullable_to_non_nullable
                  as List<InputFieldDefinition>,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [WorkflowInputSchema].
extension WorkflowInputSchemaPatterns on WorkflowInputSchema {
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
    TResult Function(_WorkflowInputSchema value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema() when $default != null:
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
    TResult Function(_WorkflowInputSchema value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema():
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
    TResult? Function(_WorkflowInputSchema value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema() when $default != null:
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
      int version,
      @JsonKey(name: 'collection_mode') String collectionMode,
      List<InputFieldDefinition> fields,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema() when $default != null:
        return $default(_that.version, _that.collectionMode, _that.fields);
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
      int version,
      @JsonKey(name: 'collection_mode') String collectionMode,
      List<InputFieldDefinition> fields,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema():
        return $default(_that.version, _that.collectionMode, _that.fields);
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
      int version,
      @JsonKey(name: 'collection_mode') String collectionMode,
      List<InputFieldDefinition> fields,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _WorkflowInputSchema() when $default != null:
        return $default(_that.version, _that.collectionMode, _that.fields);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _WorkflowInputSchema implements WorkflowInputSchema {
  const _WorkflowInputSchema({
    this.version = 1,
    @JsonKey(name: 'collection_mode') this.collectionMode = 'form',
    final List<InputFieldDefinition> fields = const [],
  }) : _fields = fields;
  factory _WorkflowInputSchema.fromJson(Map<String, dynamic> json) =>
      _$WorkflowInputSchemaFromJson(json);

  @override
  @JsonKey()
  final int version;
  @override
  @JsonKey(name: 'collection_mode')
  final String collectionMode;
  final List<InputFieldDefinition> _fields;
  @override
  @JsonKey()
  List<InputFieldDefinition> get fields {
    if (_fields is EqualUnmodifiableListView) return _fields;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_fields);
  }

  /// Create a copy of WorkflowInputSchema
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$WorkflowInputSchemaCopyWith<_WorkflowInputSchema> get copyWith =>
      __$WorkflowInputSchemaCopyWithImpl<_WorkflowInputSchema>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$WorkflowInputSchemaToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _WorkflowInputSchema &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.collectionMode, collectionMode) ||
                other.collectionMode == collectionMode) &&
            const DeepCollectionEquality().equals(other._fields, _fields));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    version,
    collectionMode,
    const DeepCollectionEquality().hash(_fields),
  );

  @override
  String toString() {
    return 'WorkflowInputSchema(version: $version, collectionMode: $collectionMode, fields: $fields)';
  }
}

/// @nodoc
abstract mixin class _$WorkflowInputSchemaCopyWith<$Res>
    implements $WorkflowInputSchemaCopyWith<$Res> {
  factory _$WorkflowInputSchemaCopyWith(
    _WorkflowInputSchema value,
    $Res Function(_WorkflowInputSchema) _then,
  ) = __$WorkflowInputSchemaCopyWithImpl;
  @override
  @useResult
  $Res call({
    int version,
    @JsonKey(name: 'collection_mode') String collectionMode,
    List<InputFieldDefinition> fields,
  });
}

/// @nodoc
class __$WorkflowInputSchemaCopyWithImpl<$Res>
    implements _$WorkflowInputSchemaCopyWith<$Res> {
  __$WorkflowInputSchemaCopyWithImpl(this._self, this._then);

  final _WorkflowInputSchema _self;
  final $Res Function(_WorkflowInputSchema) _then;

  /// Create a copy of WorkflowInputSchema
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? version = null,
    Object? collectionMode = null,
    Object? fields = null,
  }) {
    return _then(
      _WorkflowInputSchema(
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int,
        collectionMode: null == collectionMode
            ? _self.collectionMode
            : collectionMode // ignore: cast_nullable_to_non_nullable
                  as String,
        fields: null == fields
            ? _self._fields
            : fields // ignore: cast_nullable_to_non_nullable
                  as List<InputFieldDefinition>,
      ),
    );
  }
}
