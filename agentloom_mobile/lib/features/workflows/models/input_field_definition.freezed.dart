// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'input_field_definition.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$InputFieldValidation {
  @JsonKey(name: 'min_length')
  int? get minLength;
  @JsonKey(name: 'max_length')
  int? get maxLength;
  double? get min;
  double? get max;

  /// Create a copy of InputFieldValidation
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $InputFieldValidationCopyWith<InputFieldValidation> get copyWith =>
      _$InputFieldValidationCopyWithImpl<InputFieldValidation>(
        this as InputFieldValidation,
        _$identity,
      );

  /// Serializes this InputFieldValidation to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is InputFieldValidation &&
            (identical(other.minLength, minLength) ||
                other.minLength == minLength) &&
            (identical(other.maxLength, maxLength) ||
                other.maxLength == maxLength) &&
            (identical(other.min, min) || other.min == min) &&
            (identical(other.max, max) || other.max == max));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, minLength, maxLength, min, max);

  @override
  String toString() {
    return 'InputFieldValidation(minLength: $minLength, maxLength: $maxLength, min: $min, max: $max)';
  }
}

/// @nodoc
abstract mixin class $InputFieldValidationCopyWith<$Res> {
  factory $InputFieldValidationCopyWith(
    InputFieldValidation value,
    $Res Function(InputFieldValidation) _then,
  ) = _$InputFieldValidationCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(name: 'min_length') int? minLength,
    @JsonKey(name: 'max_length') int? maxLength,
    double? min,
    double? max,
  });
}

/// @nodoc
class _$InputFieldValidationCopyWithImpl<$Res>
    implements $InputFieldValidationCopyWith<$Res> {
  _$InputFieldValidationCopyWithImpl(this._self, this._then);

  final InputFieldValidation _self;
  final $Res Function(InputFieldValidation) _then;

  /// Create a copy of InputFieldValidation
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? minLength = freezed,
    Object? maxLength = freezed,
    Object? min = freezed,
    Object? max = freezed,
  }) {
    return _then(
      _self.copyWith(
        minLength: freezed == minLength
            ? _self.minLength
            : minLength // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxLength: freezed == maxLength
            ? _self.maxLength
            : maxLength // ignore: cast_nullable_to_non_nullable
                  as int?,
        min: freezed == min
            ? _self.min
            : min // ignore: cast_nullable_to_non_nullable
                  as double?,
        max: freezed == max
            ? _self.max
            : max // ignore: cast_nullable_to_non_nullable
                  as double?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [InputFieldValidation].
extension InputFieldValidationPatterns on InputFieldValidation {
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
    TResult Function(_InputFieldValidation value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation() when $default != null:
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
    TResult Function(_InputFieldValidation value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation():
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
    TResult? Function(_InputFieldValidation value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation() when $default != null:
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
      @JsonKey(name: 'min_length') int? minLength,
      @JsonKey(name: 'max_length') int? maxLength,
      double? min,
      double? max,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation() when $default != null:
        return $default(_that.minLength, _that.maxLength, _that.min, _that.max);
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
      @JsonKey(name: 'min_length') int? minLength,
      @JsonKey(name: 'max_length') int? maxLength,
      double? min,
      double? max,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation():
        return $default(_that.minLength, _that.maxLength, _that.min, _that.max);
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
      @JsonKey(name: 'min_length') int? minLength,
      @JsonKey(name: 'max_length') int? maxLength,
      double? min,
      double? max,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldValidation() when $default != null:
        return $default(_that.minLength, _that.maxLength, _that.min, _that.max);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _InputFieldValidation implements InputFieldValidation {
  const _InputFieldValidation({
    @JsonKey(name: 'min_length') this.minLength,
    @JsonKey(name: 'max_length') this.maxLength,
    this.min,
    this.max,
  });
  factory _InputFieldValidation.fromJson(Map<String, dynamic> json) =>
      _$InputFieldValidationFromJson(json);

  @override
  @JsonKey(name: 'min_length')
  final int? minLength;
  @override
  @JsonKey(name: 'max_length')
  final int? maxLength;
  @override
  final double? min;
  @override
  final double? max;

  /// Create a copy of InputFieldValidation
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$InputFieldValidationCopyWith<_InputFieldValidation> get copyWith =>
      __$InputFieldValidationCopyWithImpl<_InputFieldValidation>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$InputFieldValidationToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _InputFieldValidation &&
            (identical(other.minLength, minLength) ||
                other.minLength == minLength) &&
            (identical(other.maxLength, maxLength) ||
                other.maxLength == maxLength) &&
            (identical(other.min, min) || other.min == min) &&
            (identical(other.max, max) || other.max == max));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, minLength, maxLength, min, max);

  @override
  String toString() {
    return 'InputFieldValidation(minLength: $minLength, maxLength: $maxLength, min: $min, max: $max)';
  }
}

/// @nodoc
abstract mixin class _$InputFieldValidationCopyWith<$Res>
    implements $InputFieldValidationCopyWith<$Res> {
  factory _$InputFieldValidationCopyWith(
    _InputFieldValidation value,
    $Res Function(_InputFieldValidation) _then,
  ) = __$InputFieldValidationCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'min_length') int? minLength,
    @JsonKey(name: 'max_length') int? maxLength,
    double? min,
    double? max,
  });
}

/// @nodoc
class __$InputFieldValidationCopyWithImpl<$Res>
    implements _$InputFieldValidationCopyWith<$Res> {
  __$InputFieldValidationCopyWithImpl(this._self, this._then);

  final _InputFieldValidation _self;
  final $Res Function(_InputFieldValidation) _then;

  /// Create a copy of InputFieldValidation
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? minLength = freezed,
    Object? maxLength = freezed,
    Object? min = freezed,
    Object? max = freezed,
  }) {
    return _then(
      _InputFieldValidation(
        minLength: freezed == minLength
            ? _self.minLength
            : minLength // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxLength: freezed == maxLength
            ? _self.maxLength
            : maxLength // ignore: cast_nullable_to_non_nullable
                  as int?,
        min: freezed == min
            ? _self.min
            : min // ignore: cast_nullable_to_non_nullable
                  as double?,
        max: freezed == max
            ? _self.max
            : max // ignore: cast_nullable_to_non_nullable
                  as double?,
      ),
    );
  }
}

/// @nodoc
mixin _$InputFieldDefinition {
  String get id;
  String get type;
  String get label;
  String? get description;
  bool get required;
  InputFieldValidation? get validation;
  List<String>? get options;
  @JsonKey(name: 'default')
  dynamic get defaultValue;

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $InputFieldDefinitionCopyWith<InputFieldDefinition> get copyWith =>
      _$InputFieldDefinitionCopyWithImpl<InputFieldDefinition>(
        this as InputFieldDefinition,
        _$identity,
      );

  /// Serializes this InputFieldDefinition to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is InputFieldDefinition &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.required, required) ||
                other.required == required) &&
            (identical(other.validation, validation) ||
                other.validation == validation) &&
            const DeepCollectionEquality().equals(other.options, options) &&
            const DeepCollectionEquality().equals(
              other.defaultValue,
              defaultValue,
            ));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    type,
    label,
    description,
    required,
    validation,
    const DeepCollectionEquality().hash(options),
    const DeepCollectionEquality().hash(defaultValue),
  );

  @override
  String toString() {
    return 'InputFieldDefinition(id: $id, type: $type, label: $label, description: $description, required: $required, validation: $validation, options: $options, defaultValue: $defaultValue)';
  }
}

/// @nodoc
abstract mixin class $InputFieldDefinitionCopyWith<$Res> {
  factory $InputFieldDefinitionCopyWith(
    InputFieldDefinition value,
    $Res Function(InputFieldDefinition) _then,
  ) = _$InputFieldDefinitionCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String type,
    String label,
    String? description,
    bool required,
    InputFieldValidation? validation,
    List<String>? options,
    @JsonKey(name: 'default') dynamic defaultValue,
  });

  $InputFieldValidationCopyWith<$Res>? get validation;
}

/// @nodoc
class _$InputFieldDefinitionCopyWithImpl<$Res>
    implements $InputFieldDefinitionCopyWith<$Res> {
  _$InputFieldDefinitionCopyWithImpl(this._self, this._then);

  final InputFieldDefinition _self;
  final $Res Function(InputFieldDefinition) _then;

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? type = null,
    Object? label = null,
    Object? description = freezed,
    Object? required = null,
    Object? validation = freezed,
    Object? options = freezed,
    Object? defaultValue = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as String,
        label: null == label
            ? _self.label
            : label // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        required: null == required
            ? _self.required
            : required // ignore: cast_nullable_to_non_nullable
                  as bool,
        validation: freezed == validation
            ? _self.validation
            : validation // ignore: cast_nullable_to_non_nullable
                  as InputFieldValidation?,
        options: freezed == options
            ? _self.options
            : options // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        defaultValue: freezed == defaultValue
            ? _self.defaultValue
            : defaultValue // ignore: cast_nullable_to_non_nullable
                  as dynamic,
      ),
    );
  }

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $InputFieldValidationCopyWith<$Res>? get validation {
    if (_self.validation == null) {
      return null;
    }

    return $InputFieldValidationCopyWith<$Res>(_self.validation!, (value) {
      return _then(_self.copyWith(validation: value));
    });
  }
}

/// Adds pattern-matching-related methods to [InputFieldDefinition].
extension InputFieldDefinitionPatterns on InputFieldDefinition {
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
    TResult Function(_InputFieldDefinition value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition() when $default != null:
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
    TResult Function(_InputFieldDefinition value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition():
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
    TResult? Function(_InputFieldDefinition value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition() when $default != null:
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
      String type,
      String label,
      String? description,
      bool required,
      InputFieldValidation? validation,
      List<String>? options,
      @JsonKey(name: 'default') dynamic defaultValue,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition() when $default != null:
        return $default(
          _that.id,
          _that.type,
          _that.label,
          _that.description,
          _that.required,
          _that.validation,
          _that.options,
          _that.defaultValue,
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
      String type,
      String label,
      String? description,
      bool required,
      InputFieldValidation? validation,
      List<String>? options,
      @JsonKey(name: 'default') dynamic defaultValue,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition():
        return $default(
          _that.id,
          _that.type,
          _that.label,
          _that.description,
          _that.required,
          _that.validation,
          _that.options,
          _that.defaultValue,
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
      String type,
      String label,
      String? description,
      bool required,
      InputFieldValidation? validation,
      List<String>? options,
      @JsonKey(name: 'default') dynamic defaultValue,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _InputFieldDefinition() when $default != null:
        return $default(
          _that.id,
          _that.type,
          _that.label,
          _that.description,
          _that.required,
          _that.validation,
          _that.options,
          _that.defaultValue,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _InputFieldDefinition implements InputFieldDefinition {
  const _InputFieldDefinition({
    required this.id,
    required this.type,
    required this.label,
    this.description,
    this.required = false,
    this.validation,
    final List<String>? options,
    @JsonKey(name: 'default') this.defaultValue,
  }) : _options = options;
  factory _InputFieldDefinition.fromJson(Map<String, dynamic> json) =>
      _$InputFieldDefinitionFromJson(json);

  @override
  final String id;
  @override
  final String type;
  @override
  final String label;
  @override
  final String? description;
  @override
  @JsonKey()
  final bool required;
  @override
  final InputFieldValidation? validation;
  final List<String>? _options;
  @override
  List<String>? get options {
    final value = _options;
    if (value == null) return null;
    if (_options is EqualUnmodifiableListView) return _options;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  @JsonKey(name: 'default')
  final dynamic defaultValue;

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$InputFieldDefinitionCopyWith<_InputFieldDefinition> get copyWith =>
      __$InputFieldDefinitionCopyWithImpl<_InputFieldDefinition>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$InputFieldDefinitionToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _InputFieldDefinition &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.required, required) ||
                other.required == required) &&
            (identical(other.validation, validation) ||
                other.validation == validation) &&
            const DeepCollectionEquality().equals(other._options, _options) &&
            const DeepCollectionEquality().equals(
              other.defaultValue,
              defaultValue,
            ));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    type,
    label,
    description,
    required,
    validation,
    const DeepCollectionEquality().hash(_options),
    const DeepCollectionEquality().hash(defaultValue),
  );

  @override
  String toString() {
    return 'InputFieldDefinition(id: $id, type: $type, label: $label, description: $description, required: $required, validation: $validation, options: $options, defaultValue: $defaultValue)';
  }
}

/// @nodoc
abstract mixin class _$InputFieldDefinitionCopyWith<$Res>
    implements $InputFieldDefinitionCopyWith<$Res> {
  factory _$InputFieldDefinitionCopyWith(
    _InputFieldDefinition value,
    $Res Function(_InputFieldDefinition) _then,
  ) = __$InputFieldDefinitionCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String type,
    String label,
    String? description,
    bool required,
    InputFieldValidation? validation,
    List<String>? options,
    @JsonKey(name: 'default') dynamic defaultValue,
  });

  @override
  $InputFieldValidationCopyWith<$Res>? get validation;
}

/// @nodoc
class __$InputFieldDefinitionCopyWithImpl<$Res>
    implements _$InputFieldDefinitionCopyWith<$Res> {
  __$InputFieldDefinitionCopyWithImpl(this._self, this._then);

  final _InputFieldDefinition _self;
  final $Res Function(_InputFieldDefinition) _then;

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? type = null,
    Object? label = null,
    Object? description = freezed,
    Object? required = null,
    Object? validation = freezed,
    Object? options = freezed,
    Object? defaultValue = freezed,
  }) {
    return _then(
      _InputFieldDefinition(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as String,
        label: null == label
            ? _self.label
            : label // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        required: null == required
            ? _self.required
            : required // ignore: cast_nullable_to_non_nullable
                  as bool,
        validation: freezed == validation
            ? _self.validation
            : validation // ignore: cast_nullable_to_non_nullable
                  as InputFieldValidation?,
        options: freezed == options
            ? _self._options
            : options // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        defaultValue: freezed == defaultValue
            ? _self.defaultValue
            : defaultValue // ignore: cast_nullable_to_non_nullable
                  as dynamic,
      ),
    );
  }

  /// Create a copy of InputFieldDefinition
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $InputFieldValidationCopyWith<$Res>? get validation {
    if (_self.validation == null) {
      return null;
    }

    return $InputFieldValidationCopyWith<$Res>(_self.validation!, (value) {
      return _then(_self.copyWith(validation: value));
    });
  }
}
