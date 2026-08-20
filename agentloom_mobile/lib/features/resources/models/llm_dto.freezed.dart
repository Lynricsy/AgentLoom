// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'llm_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ApiKeyInfoDto {
  String get id;
  String get provider;
  String get label;
  String get keyPreview;
  bool get isDefault;
  String get status;
  String? get lastUsedAt;
  String? get rotatedAt;
  String? get expiresAt;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of ApiKeyInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ApiKeyInfoDtoCopyWith<ApiKeyInfoDto> get copyWith =>
      _$ApiKeyInfoDtoCopyWithImpl<ApiKeyInfoDto>(
        this as ApiKeyInfoDto,
        _$identity,
      );

  /// Serializes this ApiKeyInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ApiKeyInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.provider, provider) ||
                other.provider == provider) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.keyPreview, keyPreview) ||
                other.keyPreview == keyPreview) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastUsedAt, lastUsedAt) ||
                other.lastUsedAt == lastUsedAt) &&
            (identical(other.rotatedAt, rotatedAt) ||
                other.rotatedAt == rotatedAt) &&
            (identical(other.expiresAt, expiresAt) ||
                other.expiresAt == expiresAt) &&
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
    provider,
    label,
    keyPreview,
    isDefault,
    status,
    lastUsedAt,
    rotatedAt,
    expiresAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ApiKeyInfoDto(id: $id, provider: $provider, label: $label, keyPreview: $keyPreview, isDefault: $isDefault, status: $status, lastUsedAt: $lastUsedAt, rotatedAt: $rotatedAt, expiresAt: $expiresAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $ApiKeyInfoDtoCopyWith<$Res> {
  factory $ApiKeyInfoDtoCopyWith(
    ApiKeyInfoDto value,
    $Res Function(ApiKeyInfoDto) _then,
  ) = _$ApiKeyInfoDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String provider,
    String label,
    String keyPreview,
    bool isDefault,
    String status,
    String? lastUsedAt,
    String? rotatedAt,
    String? expiresAt,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$ApiKeyInfoDtoCopyWithImpl<$Res>
    implements $ApiKeyInfoDtoCopyWith<$Res> {
  _$ApiKeyInfoDtoCopyWithImpl(this._self, this._then);

  final ApiKeyInfoDto _self;
  final $Res Function(ApiKeyInfoDto) _then;

  /// Create a copy of ApiKeyInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? provider = null,
    Object? label = null,
    Object? keyPreview = null,
    Object? isDefault = null,
    Object? status = null,
    Object? lastUsedAt = freezed,
    Object? rotatedAt = freezed,
    Object? expiresAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        provider: null == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as String,
        label: null == label
            ? _self.label
            : label // ignore: cast_nullable_to_non_nullable
                  as String,
        keyPreview: null == keyPreview
            ? _self.keyPreview
            : keyPreview // ignore: cast_nullable_to_non_nullable
                  as String,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastUsedAt: freezed == lastUsedAt
            ? _self.lastUsedAt
            : lastUsedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        rotatedAt: freezed == rotatedAt
            ? _self.rotatedAt
            : rotatedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        expiresAt: freezed == expiresAt
            ? _self.expiresAt
            : expiresAt // ignore: cast_nullable_to_non_nullable
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

/// Adds pattern-matching-related methods to [ApiKeyInfoDto].
extension ApiKeyInfoDtoPatterns on ApiKeyInfoDto {
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
    TResult Function(_ApiKeyInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto() when $default != null:
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
    TResult Function(_ApiKeyInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto():
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
    TResult? Function(_ApiKeyInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto() when $default != null:
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
      String provider,
      String label,
      String keyPreview,
      bool isDefault,
      String status,
      String? lastUsedAt,
      String? rotatedAt,
      String? expiresAt,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.provider,
          _that.label,
          _that.keyPreview,
          _that.isDefault,
          _that.status,
          _that.lastUsedAt,
          _that.rotatedAt,
          _that.expiresAt,
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
      String provider,
      String label,
      String keyPreview,
      bool isDefault,
      String status,
      String? lastUsedAt,
      String? rotatedAt,
      String? expiresAt,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto():
        return $default(
          _that.id,
          _that.provider,
          _that.label,
          _that.keyPreview,
          _that.isDefault,
          _that.status,
          _that.lastUsedAt,
          _that.rotatedAt,
          _that.expiresAt,
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
      String provider,
      String label,
      String keyPreview,
      bool isDefault,
      String status,
      String? lastUsedAt,
      String? rotatedAt,
      String? expiresAt,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ApiKeyInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.provider,
          _that.label,
          _that.keyPreview,
          _that.isDefault,
          _that.status,
          _that.lastUsedAt,
          _that.rotatedAt,
          _that.expiresAt,
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
class _ApiKeyInfoDto implements ApiKeyInfoDto {
  const _ApiKeyInfoDto({
    required this.id,
    required this.provider,
    required this.label,
    required this.keyPreview,
    this.isDefault = false,
    required this.status,
    this.lastUsedAt,
    this.rotatedAt,
    this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
  });
  factory _ApiKeyInfoDto.fromJson(Map<String, dynamic> json) =>
      _$ApiKeyInfoDtoFromJson(json);

  @override
  final String id;
  @override
  final String provider;
  @override
  final String label;
  @override
  final String keyPreview;
  @override
  @JsonKey()
  final bool isDefault;
  @override
  final String status;
  @override
  final String? lastUsedAt;
  @override
  final String? rotatedAt;
  @override
  final String? expiresAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of ApiKeyInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ApiKeyInfoDtoCopyWith<_ApiKeyInfoDto> get copyWith =>
      __$ApiKeyInfoDtoCopyWithImpl<_ApiKeyInfoDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ApiKeyInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ApiKeyInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.provider, provider) ||
                other.provider == provider) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.keyPreview, keyPreview) ||
                other.keyPreview == keyPreview) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastUsedAt, lastUsedAt) ||
                other.lastUsedAt == lastUsedAt) &&
            (identical(other.rotatedAt, rotatedAt) ||
                other.rotatedAt == rotatedAt) &&
            (identical(other.expiresAt, expiresAt) ||
                other.expiresAt == expiresAt) &&
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
    provider,
    label,
    keyPreview,
    isDefault,
    status,
    lastUsedAt,
    rotatedAt,
    expiresAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ApiKeyInfoDto(id: $id, provider: $provider, label: $label, keyPreview: $keyPreview, isDefault: $isDefault, status: $status, lastUsedAt: $lastUsedAt, rotatedAt: $rotatedAt, expiresAt: $expiresAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$ApiKeyInfoDtoCopyWith<$Res>
    implements $ApiKeyInfoDtoCopyWith<$Res> {
  factory _$ApiKeyInfoDtoCopyWith(
    _ApiKeyInfoDto value,
    $Res Function(_ApiKeyInfoDto) _then,
  ) = __$ApiKeyInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String provider,
    String label,
    String keyPreview,
    bool isDefault,
    String status,
    String? lastUsedAt,
    String? rotatedAt,
    String? expiresAt,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$ApiKeyInfoDtoCopyWithImpl<$Res>
    implements _$ApiKeyInfoDtoCopyWith<$Res> {
  __$ApiKeyInfoDtoCopyWithImpl(this._self, this._then);

  final _ApiKeyInfoDto _self;
  final $Res Function(_ApiKeyInfoDto) _then;

  /// Create a copy of ApiKeyInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? provider = null,
    Object? label = null,
    Object? keyPreview = null,
    Object? isDefault = null,
    Object? status = null,
    Object? lastUsedAt = freezed,
    Object? rotatedAt = freezed,
    Object? expiresAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _ApiKeyInfoDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        provider: null == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as String,
        label: null == label
            ? _self.label
            : label // ignore: cast_nullable_to_non_nullable
                  as String,
        keyPreview: null == keyPreview
            ? _self.keyPreview
            : keyPreview // ignore: cast_nullable_to_non_nullable
                  as String,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastUsedAt: freezed == lastUsedAt
            ? _self.lastUsedAt
            : lastUsedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        rotatedAt: freezed == rotatedAt
            ? _self.rotatedAt
            : rotatedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        expiresAt: freezed == expiresAt
            ? _self.expiresAt
            : expiresAt // ignore: cast_nullable_to_non_nullable
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

/// @nodoc
mixin _$LlmProviderInfoDto {
  String get id;
  String get name;
  List<String> get models;
  String get defaultModel;
  bool get supportsStreaming;
  bool get supportsStructuredOutput;

  /// Create a copy of LlmProviderInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LlmProviderInfoDtoCopyWith<LlmProviderInfoDto> get copyWith =>
      _$LlmProviderInfoDtoCopyWithImpl<LlmProviderInfoDto>(
        this as LlmProviderInfoDto,
        _$identity,
      );

  /// Serializes this LlmProviderInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LlmProviderInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            const DeepCollectionEquality().equals(other.models, models) &&
            (identical(other.defaultModel, defaultModel) ||
                other.defaultModel == defaultModel) &&
            (identical(other.supportsStreaming, supportsStreaming) ||
                other.supportsStreaming == supportsStreaming) &&
            (identical(
                  other.supportsStructuredOutput,
                  supportsStructuredOutput,
                ) ||
                other.supportsStructuredOutput == supportsStructuredOutput));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    name,
    const DeepCollectionEquality().hash(models),
    defaultModel,
    supportsStreaming,
    supportsStructuredOutput,
  );

  @override
  String toString() {
    return 'LlmProviderInfoDto(id: $id, name: $name, models: $models, defaultModel: $defaultModel, supportsStreaming: $supportsStreaming, supportsStructuredOutput: $supportsStructuredOutput)';
  }
}

/// @nodoc
abstract mixin class $LlmProviderInfoDtoCopyWith<$Res> {
  factory $LlmProviderInfoDtoCopyWith(
    LlmProviderInfoDto value,
    $Res Function(LlmProviderInfoDto) _then,
  ) = _$LlmProviderInfoDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    List<String> models,
    String defaultModel,
    bool supportsStreaming,
    bool supportsStructuredOutput,
  });
}

/// @nodoc
class _$LlmProviderInfoDtoCopyWithImpl<$Res>
    implements $LlmProviderInfoDtoCopyWith<$Res> {
  _$LlmProviderInfoDtoCopyWithImpl(this._self, this._then);

  final LlmProviderInfoDto _self;
  final $Res Function(LlmProviderInfoDto) _then;

  /// Create a copy of LlmProviderInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? models = null,
    Object? defaultModel = null,
    Object? supportsStreaming = null,
    Object? supportsStructuredOutput = null,
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
        models: null == models
            ? _self.models
            : models // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        defaultModel: null == defaultModel
            ? _self.defaultModel
            : defaultModel // ignore: cast_nullable_to_non_nullable
                  as String,
        supportsStreaming: null == supportsStreaming
            ? _self.supportsStreaming
            : supportsStreaming // ignore: cast_nullable_to_non_nullable
                  as bool,
        supportsStructuredOutput: null == supportsStructuredOutput
            ? _self.supportsStructuredOutput
            : supportsStructuredOutput // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [LlmProviderInfoDto].
extension LlmProviderInfoDtoPatterns on LlmProviderInfoDto {
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
    TResult Function(_LlmProviderInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto() when $default != null:
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
    TResult Function(_LlmProviderInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto():
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
    TResult? Function(_LlmProviderInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto() when $default != null:
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
      List<String> models,
      String defaultModel,
      bool supportsStreaming,
      bool supportsStructuredOutput,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.models,
          _that.defaultModel,
          _that.supportsStreaming,
          _that.supportsStructuredOutput,
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
      List<String> models,
      String defaultModel,
      bool supportsStreaming,
      bool supportsStructuredOutput,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto():
        return $default(
          _that.id,
          _that.name,
          _that.models,
          _that.defaultModel,
          _that.supportsStreaming,
          _that.supportsStructuredOutput,
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
      List<String> models,
      String defaultModel,
      bool supportsStreaming,
      bool supportsStructuredOutput,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.models,
          _that.defaultModel,
          _that.supportsStreaming,
          _that.supportsStructuredOutput,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LlmProviderInfoDto implements LlmProviderInfoDto {
  const _LlmProviderInfoDto({
    required this.id,
    required this.name,
    final List<String> models = const <String>[],
    required this.defaultModel,
    this.supportsStreaming = false,
    this.supportsStructuredOutput = false,
  }) : _models = models;
  factory _LlmProviderInfoDto.fromJson(Map<String, dynamic> json) =>
      _$LlmProviderInfoDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  final List<String> _models;
  @override
  @JsonKey()
  List<String> get models {
    if (_models is EqualUnmodifiableListView) return _models;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_models);
  }

  @override
  final String defaultModel;
  @override
  @JsonKey()
  final bool supportsStreaming;
  @override
  @JsonKey()
  final bool supportsStructuredOutput;

  /// Create a copy of LlmProviderInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LlmProviderInfoDtoCopyWith<_LlmProviderInfoDto> get copyWith =>
      __$LlmProviderInfoDtoCopyWithImpl<_LlmProviderInfoDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$LlmProviderInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LlmProviderInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            const DeepCollectionEquality().equals(other._models, _models) &&
            (identical(other.defaultModel, defaultModel) ||
                other.defaultModel == defaultModel) &&
            (identical(other.supportsStreaming, supportsStreaming) ||
                other.supportsStreaming == supportsStreaming) &&
            (identical(
                  other.supportsStructuredOutput,
                  supportsStructuredOutput,
                ) ||
                other.supportsStructuredOutput == supportsStructuredOutput));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    name,
    const DeepCollectionEquality().hash(_models),
    defaultModel,
    supportsStreaming,
    supportsStructuredOutput,
  );

  @override
  String toString() {
    return 'LlmProviderInfoDto(id: $id, name: $name, models: $models, defaultModel: $defaultModel, supportsStreaming: $supportsStreaming, supportsStructuredOutput: $supportsStructuredOutput)';
  }
}

/// @nodoc
abstract mixin class _$LlmProviderInfoDtoCopyWith<$Res>
    implements $LlmProviderInfoDtoCopyWith<$Res> {
  factory _$LlmProviderInfoDtoCopyWith(
    _LlmProviderInfoDto value,
    $Res Function(_LlmProviderInfoDto) _then,
  ) = __$LlmProviderInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    List<String> models,
    String defaultModel,
    bool supportsStreaming,
    bool supportsStructuredOutput,
  });
}

/// @nodoc
class __$LlmProviderInfoDtoCopyWithImpl<$Res>
    implements _$LlmProviderInfoDtoCopyWith<$Res> {
  __$LlmProviderInfoDtoCopyWithImpl(this._self, this._then);

  final _LlmProviderInfoDto _self;
  final $Res Function(_LlmProviderInfoDto) _then;

  /// Create a copy of LlmProviderInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? models = null,
    Object? defaultModel = null,
    Object? supportsStreaming = null,
    Object? supportsStructuredOutput = null,
  }) {
    return _then(
      _LlmProviderInfoDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        models: null == models
            ? _self._models
            : models // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        defaultModel: null == defaultModel
            ? _self.defaultModel
            : defaultModel // ignore: cast_nullable_to_non_nullable
                  as String,
        supportsStreaming: null == supportsStreaming
            ? _self.supportsStreaming
            : supportsStreaming // ignore: cast_nullable_to_non_nullable
                  as bool,
        supportsStructuredOutput: null == supportsStructuredOutput
            ? _self.supportsStructuredOutput
            : supportsStructuredOutput // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// @nodoc
mixin _$LlmParametersDto {
  double get temperature;
  int? get maxTokens;
  double get topP;
  double get frequencyPenalty;
  double get presencePenalty;
  List<String> get stop;

  /// Create a copy of LlmParametersDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LlmParametersDtoCopyWith<LlmParametersDto> get copyWith =>
      _$LlmParametersDtoCopyWithImpl<LlmParametersDto>(
        this as LlmParametersDto,
        _$identity,
      );

  /// Serializes this LlmParametersDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LlmParametersDto &&
            (identical(other.temperature, temperature) ||
                other.temperature == temperature) &&
            (identical(other.maxTokens, maxTokens) ||
                other.maxTokens == maxTokens) &&
            (identical(other.topP, topP) || other.topP == topP) &&
            (identical(other.frequencyPenalty, frequencyPenalty) ||
                other.frequencyPenalty == frequencyPenalty) &&
            (identical(other.presencePenalty, presencePenalty) ||
                other.presencePenalty == presencePenalty) &&
            const DeepCollectionEquality().equals(other.stop, stop));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    const DeepCollectionEquality().hash(stop),
  );

  @override
  String toString() {
    return 'LlmParametersDto(temperature: $temperature, maxTokens: $maxTokens, topP: $topP, frequencyPenalty: $frequencyPenalty, presencePenalty: $presencePenalty, stop: $stop)';
  }
}

/// @nodoc
abstract mixin class $LlmParametersDtoCopyWith<$Res> {
  factory $LlmParametersDtoCopyWith(
    LlmParametersDto value,
    $Res Function(LlmParametersDto) _then,
  ) = _$LlmParametersDtoCopyWithImpl;
  @useResult
  $Res call({
    double temperature,
    int? maxTokens,
    double topP,
    double frequencyPenalty,
    double presencePenalty,
    List<String> stop,
  });
}

/// @nodoc
class _$LlmParametersDtoCopyWithImpl<$Res>
    implements $LlmParametersDtoCopyWith<$Res> {
  _$LlmParametersDtoCopyWithImpl(this._self, this._then);

  final LlmParametersDto _self;
  final $Res Function(LlmParametersDto) _then;

  /// Create a copy of LlmParametersDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? temperature = null,
    Object? maxTokens = freezed,
    Object? topP = null,
    Object? frequencyPenalty = null,
    Object? presencePenalty = null,
    Object? stop = null,
  }) {
    return _then(
      _self.copyWith(
        temperature: null == temperature
            ? _self.temperature
            : temperature // ignore: cast_nullable_to_non_nullable
                  as double,
        maxTokens: freezed == maxTokens
            ? _self.maxTokens
            : maxTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        topP: null == topP
            ? _self.topP
            : topP // ignore: cast_nullable_to_non_nullable
                  as double,
        frequencyPenalty: null == frequencyPenalty
            ? _self.frequencyPenalty
            : frequencyPenalty // ignore: cast_nullable_to_non_nullable
                  as double,
        presencePenalty: null == presencePenalty
            ? _self.presencePenalty
            : presencePenalty // ignore: cast_nullable_to_non_nullable
                  as double,
        stop: null == stop
            ? _self.stop
            : stop // ignore: cast_nullable_to_non_nullable
                  as List<String>,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [LlmParametersDto].
extension LlmParametersDtoPatterns on LlmParametersDto {
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
    TResult Function(_LlmParametersDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto() when $default != null:
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
    TResult Function(_LlmParametersDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto():
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
    TResult? Function(_LlmParametersDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto() when $default != null:
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
      double temperature,
      int? maxTokens,
      double topP,
      double frequencyPenalty,
      double presencePenalty,
      List<String> stop,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto() when $default != null:
        return $default(
          _that.temperature,
          _that.maxTokens,
          _that.topP,
          _that.frequencyPenalty,
          _that.presencePenalty,
          _that.stop,
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
      double temperature,
      int? maxTokens,
      double topP,
      double frequencyPenalty,
      double presencePenalty,
      List<String> stop,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto():
        return $default(
          _that.temperature,
          _that.maxTokens,
          _that.topP,
          _that.frequencyPenalty,
          _that.presencePenalty,
          _that.stop,
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
      double temperature,
      int? maxTokens,
      double topP,
      double frequencyPenalty,
      double presencePenalty,
      List<String> stop,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmParametersDto() when $default != null:
        return $default(
          _that.temperature,
          _that.maxTokens,
          _that.topP,
          _that.frequencyPenalty,
          _that.presencePenalty,
          _that.stop,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LlmParametersDto implements LlmParametersDto {
  const _LlmParametersDto({
    this.temperature = 0.7,
    this.maxTokens,
    this.topP = 1,
    this.frequencyPenalty = 0,
    this.presencePenalty = 0,
    final List<String> stop = const <String>[],
  }) : _stop = stop;
  factory _LlmParametersDto.fromJson(Map<String, dynamic> json) =>
      _$LlmParametersDtoFromJson(json);

  @override
  @JsonKey()
  final double temperature;
  @override
  final int? maxTokens;
  @override
  @JsonKey()
  final double topP;
  @override
  @JsonKey()
  final double frequencyPenalty;
  @override
  @JsonKey()
  final double presencePenalty;
  final List<String> _stop;
  @override
  @JsonKey()
  List<String> get stop {
    if (_stop is EqualUnmodifiableListView) return _stop;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_stop);
  }

  /// Create a copy of LlmParametersDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LlmParametersDtoCopyWith<_LlmParametersDto> get copyWith =>
      __$LlmParametersDtoCopyWithImpl<_LlmParametersDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$LlmParametersDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LlmParametersDto &&
            (identical(other.temperature, temperature) ||
                other.temperature == temperature) &&
            (identical(other.maxTokens, maxTokens) ||
                other.maxTokens == maxTokens) &&
            (identical(other.topP, topP) || other.topP == topP) &&
            (identical(other.frequencyPenalty, frequencyPenalty) ||
                other.frequencyPenalty == frequencyPenalty) &&
            (identical(other.presencePenalty, presencePenalty) ||
                other.presencePenalty == presencePenalty) &&
            const DeepCollectionEquality().equals(other._stop, _stop));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    const DeepCollectionEquality().hash(_stop),
  );

  @override
  String toString() {
    return 'LlmParametersDto(temperature: $temperature, maxTokens: $maxTokens, topP: $topP, frequencyPenalty: $frequencyPenalty, presencePenalty: $presencePenalty, stop: $stop)';
  }
}

/// @nodoc
abstract mixin class _$LlmParametersDtoCopyWith<$Res>
    implements $LlmParametersDtoCopyWith<$Res> {
  factory _$LlmParametersDtoCopyWith(
    _LlmParametersDto value,
    $Res Function(_LlmParametersDto) _then,
  ) = __$LlmParametersDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    double temperature,
    int? maxTokens,
    double topP,
    double frequencyPenalty,
    double presencePenalty,
    List<String> stop,
  });
}

/// @nodoc
class __$LlmParametersDtoCopyWithImpl<$Res>
    implements _$LlmParametersDtoCopyWith<$Res> {
  __$LlmParametersDtoCopyWithImpl(this._self, this._then);

  final _LlmParametersDto _self;
  final $Res Function(_LlmParametersDto) _then;

  /// Create a copy of LlmParametersDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? temperature = null,
    Object? maxTokens = freezed,
    Object? topP = null,
    Object? frequencyPenalty = null,
    Object? presencePenalty = null,
    Object? stop = null,
  }) {
    return _then(
      _LlmParametersDto(
        temperature: null == temperature
            ? _self.temperature
            : temperature // ignore: cast_nullable_to_non_nullable
                  as double,
        maxTokens: freezed == maxTokens
            ? _self.maxTokens
            : maxTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        topP: null == topP
            ? _self.topP
            : topP // ignore: cast_nullable_to_non_nullable
                  as double,
        frequencyPenalty: null == frequencyPenalty
            ? _self.frequencyPenalty
            : frequencyPenalty // ignore: cast_nullable_to_non_nullable
                  as double,
        presencePenalty: null == presencePenalty
            ? _self.presencePenalty
            : presencePenalty // ignore: cast_nullable_to_non_nullable
                  as double,
        stop: null == stop
            ? _self._stop
            : stop // ignore: cast_nullable_to_non_nullable
                  as List<String>,
      ),
    );
  }
}

/// @nodoc
mixin _$LlmModelInfoDto {
  String get id;
  String get name;
  String get provider;
  String get modelType;
  String get modelName;
  LlmParametersDto get parameters;
  String? get apiKeyId;
  int? get embeddingDimensions;
  bool get isDefault;
  String get createdAt;
  String get updatedAt;
  String? get endpointUrl;
  String? get authMethod;
  Map<String, dynamic>? get authConfig;
  int? get timeoutMs;

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LlmModelInfoDtoCopyWith<LlmModelInfoDto> get copyWith =>
      _$LlmModelInfoDtoCopyWithImpl<LlmModelInfoDto>(
        this as LlmModelInfoDto,
        _$identity,
      );

  /// Serializes this LlmModelInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LlmModelInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.provider, provider) ||
                other.provider == provider) &&
            (identical(other.modelType, modelType) ||
                other.modelType == modelType) &&
            (identical(other.modelName, modelName) ||
                other.modelName == modelName) &&
            (identical(other.parameters, parameters) ||
                other.parameters == parameters) &&
            (identical(other.apiKeyId, apiKeyId) ||
                other.apiKeyId == apiKeyId) &&
            (identical(other.embeddingDimensions, embeddingDimensions) ||
                other.embeddingDimensions == embeddingDimensions) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.endpointUrl, endpointUrl) ||
                other.endpointUrl == endpointUrl) &&
            (identical(other.authMethod, authMethod) ||
                other.authMethod == authMethod) &&
            const DeepCollectionEquality().equals(
              other.authConfig,
              authConfig,
            ) &&
            (identical(other.timeoutMs, timeoutMs) ||
                other.timeoutMs == timeoutMs));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    name,
    provider,
    modelType,
    modelName,
    parameters,
    apiKeyId,
    embeddingDimensions,
    isDefault,
    createdAt,
    updatedAt,
    endpointUrl,
    authMethod,
    const DeepCollectionEquality().hash(authConfig),
    timeoutMs,
  );

  @override
  String toString() {
    return 'LlmModelInfoDto(id: $id, name: $name, provider: $provider, modelType: $modelType, modelName: $modelName, parameters: $parameters, apiKeyId: $apiKeyId, embeddingDimensions: $embeddingDimensions, isDefault: $isDefault, createdAt: $createdAt, updatedAt: $updatedAt, endpointUrl: $endpointUrl, authMethod: $authMethod, authConfig: $authConfig, timeoutMs: $timeoutMs)';
  }
}

/// @nodoc
abstract mixin class $LlmModelInfoDtoCopyWith<$Res> {
  factory $LlmModelInfoDtoCopyWith(
    LlmModelInfoDto value,
    $Res Function(LlmModelInfoDto) _then,
  ) = _$LlmModelInfoDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    String provider,
    String modelType,
    String modelName,
    LlmParametersDto parameters,
    String? apiKeyId,
    int? embeddingDimensions,
    bool isDefault,
    String createdAt,
    String updatedAt,
    String? endpointUrl,
    String? authMethod,
    Map<String, dynamic>? authConfig,
    int? timeoutMs,
  });

  $LlmParametersDtoCopyWith<$Res> get parameters;
}

/// @nodoc
class _$LlmModelInfoDtoCopyWithImpl<$Res>
    implements $LlmModelInfoDtoCopyWith<$Res> {
  _$LlmModelInfoDtoCopyWithImpl(this._self, this._then);

  final LlmModelInfoDto _self;
  final $Res Function(LlmModelInfoDto) _then;

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? provider = null,
    Object? modelType = null,
    Object? modelName = null,
    Object? parameters = null,
    Object? apiKeyId = freezed,
    Object? embeddingDimensions = freezed,
    Object? isDefault = null,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? endpointUrl = freezed,
    Object? authMethod = freezed,
    Object? authConfig = freezed,
    Object? timeoutMs = freezed,
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
        provider: null == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as String,
        modelType: null == modelType
            ? _self.modelType
            : modelType // ignore: cast_nullable_to_non_nullable
                  as String,
        modelName: null == modelName
            ? _self.modelName
            : modelName // ignore: cast_nullable_to_non_nullable
                  as String,
        parameters: null == parameters
            ? _self.parameters
            : parameters // ignore: cast_nullable_to_non_nullable
                  as LlmParametersDto,
        apiKeyId: freezed == apiKeyId
            ? _self.apiKeyId
            : apiKeyId // ignore: cast_nullable_to_non_nullable
                  as String?,
        embeddingDimensions: freezed == embeddingDimensions
            ? _self.embeddingDimensions
            : embeddingDimensions // ignore: cast_nullable_to_non_nullable
                  as int?,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        endpointUrl: freezed == endpointUrl
            ? _self.endpointUrl
            : endpointUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        authMethod: freezed == authMethod
            ? _self.authMethod
            : authMethod // ignore: cast_nullable_to_non_nullable
                  as String?,
        authConfig: freezed == authConfig
            ? _self.authConfig
            : authConfig // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        timeoutMs: freezed == timeoutMs
            ? _self.timeoutMs
            : timeoutMs // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $LlmParametersDtoCopyWith<$Res> get parameters {
    return $LlmParametersDtoCopyWith<$Res>(_self.parameters, (value) {
      return _then(_self.copyWith(parameters: value));
    });
  }
}

/// Adds pattern-matching-related methods to [LlmModelInfoDto].
extension LlmModelInfoDtoPatterns on LlmModelInfoDto {
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
    TResult Function(_LlmModelInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto() when $default != null:
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
    TResult Function(_LlmModelInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto():
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
    TResult? Function(_LlmModelInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto() when $default != null:
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
      String provider,
      String modelType,
      String modelName,
      LlmParametersDto parameters,
      String? apiKeyId,
      int? embeddingDimensions,
      bool isDefault,
      String createdAt,
      String updatedAt,
      String? endpointUrl,
      String? authMethod,
      Map<String, dynamic>? authConfig,
      int? timeoutMs,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.provider,
          _that.modelType,
          _that.modelName,
          _that.parameters,
          _that.apiKeyId,
          _that.embeddingDimensions,
          _that.isDefault,
          _that.createdAt,
          _that.updatedAt,
          _that.endpointUrl,
          _that.authMethod,
          _that.authConfig,
          _that.timeoutMs,
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
      String provider,
      String modelType,
      String modelName,
      LlmParametersDto parameters,
      String? apiKeyId,
      int? embeddingDimensions,
      bool isDefault,
      String createdAt,
      String updatedAt,
      String? endpointUrl,
      String? authMethod,
      Map<String, dynamic>? authConfig,
      int? timeoutMs,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto():
        return $default(
          _that.id,
          _that.name,
          _that.provider,
          _that.modelType,
          _that.modelName,
          _that.parameters,
          _that.apiKeyId,
          _that.embeddingDimensions,
          _that.isDefault,
          _that.createdAt,
          _that.updatedAt,
          _that.endpointUrl,
          _that.authMethod,
          _that.authConfig,
          _that.timeoutMs,
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
      String provider,
      String modelType,
      String modelName,
      LlmParametersDto parameters,
      String? apiKeyId,
      int? embeddingDimensions,
      bool isDefault,
      String createdAt,
      String updatedAt,
      String? endpointUrl,
      String? authMethod,
      Map<String, dynamic>? authConfig,
      int? timeoutMs,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelInfoDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.provider,
          _that.modelType,
          _that.modelName,
          _that.parameters,
          _that.apiKeyId,
          _that.embeddingDimensions,
          _that.isDefault,
          _that.createdAt,
          _that.updatedAt,
          _that.endpointUrl,
          _that.authMethod,
          _that.authConfig,
          _that.timeoutMs,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LlmModelInfoDto implements LlmModelInfoDto {
  const _LlmModelInfoDto({
    required this.id,
    required this.name,
    this.provider = 'openai',
    this.modelType = 'chat',
    required this.modelName,
    this.parameters = const LlmParametersDto(),
    this.apiKeyId,
    this.embeddingDimensions,
    this.isDefault = false,
    required this.createdAt,
    required this.updatedAt,
    this.endpointUrl,
    this.authMethod,
    final Map<String, dynamic>? authConfig,
    this.timeoutMs,
  }) : _authConfig = authConfig;
  factory _LlmModelInfoDto.fromJson(Map<String, dynamic> json) =>
      _$LlmModelInfoDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  @JsonKey()
  final String provider;
  @override
  @JsonKey()
  final String modelType;
  @override
  final String modelName;
  @override
  @JsonKey()
  final LlmParametersDto parameters;
  @override
  final String? apiKeyId;
  @override
  final int? embeddingDimensions;
  @override
  @JsonKey()
  final bool isDefault;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final String? endpointUrl;
  @override
  final String? authMethod;
  final Map<String, dynamic>? _authConfig;
  @override
  Map<String, dynamic>? get authConfig {
    final value = _authConfig;
    if (value == null) return null;
    if (_authConfig is EqualUnmodifiableMapView) return _authConfig;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final int? timeoutMs;

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LlmModelInfoDtoCopyWith<_LlmModelInfoDto> get copyWith =>
      __$LlmModelInfoDtoCopyWithImpl<_LlmModelInfoDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$LlmModelInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LlmModelInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.provider, provider) ||
                other.provider == provider) &&
            (identical(other.modelType, modelType) ||
                other.modelType == modelType) &&
            (identical(other.modelName, modelName) ||
                other.modelName == modelName) &&
            (identical(other.parameters, parameters) ||
                other.parameters == parameters) &&
            (identical(other.apiKeyId, apiKeyId) ||
                other.apiKeyId == apiKeyId) &&
            (identical(other.embeddingDimensions, embeddingDimensions) ||
                other.embeddingDimensions == embeddingDimensions) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.endpointUrl, endpointUrl) ||
                other.endpointUrl == endpointUrl) &&
            (identical(other.authMethod, authMethod) ||
                other.authMethod == authMethod) &&
            const DeepCollectionEquality().equals(
              other._authConfig,
              _authConfig,
            ) &&
            (identical(other.timeoutMs, timeoutMs) ||
                other.timeoutMs == timeoutMs));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    name,
    provider,
    modelType,
    modelName,
    parameters,
    apiKeyId,
    embeddingDimensions,
    isDefault,
    createdAt,
    updatedAt,
    endpointUrl,
    authMethod,
    const DeepCollectionEquality().hash(_authConfig),
    timeoutMs,
  );

  @override
  String toString() {
    return 'LlmModelInfoDto(id: $id, name: $name, provider: $provider, modelType: $modelType, modelName: $modelName, parameters: $parameters, apiKeyId: $apiKeyId, embeddingDimensions: $embeddingDimensions, isDefault: $isDefault, createdAt: $createdAt, updatedAt: $updatedAt, endpointUrl: $endpointUrl, authMethod: $authMethod, authConfig: $authConfig, timeoutMs: $timeoutMs)';
  }
}

/// @nodoc
abstract mixin class _$LlmModelInfoDtoCopyWith<$Res>
    implements $LlmModelInfoDtoCopyWith<$Res> {
  factory _$LlmModelInfoDtoCopyWith(
    _LlmModelInfoDto value,
    $Res Function(_LlmModelInfoDto) _then,
  ) = __$LlmModelInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String provider,
    String modelType,
    String modelName,
    LlmParametersDto parameters,
    String? apiKeyId,
    int? embeddingDimensions,
    bool isDefault,
    String createdAt,
    String updatedAt,
    String? endpointUrl,
    String? authMethod,
    Map<String, dynamic>? authConfig,
    int? timeoutMs,
  });

  @override
  $LlmParametersDtoCopyWith<$Res> get parameters;
}

/// @nodoc
class __$LlmModelInfoDtoCopyWithImpl<$Res>
    implements _$LlmModelInfoDtoCopyWith<$Res> {
  __$LlmModelInfoDtoCopyWithImpl(this._self, this._then);

  final _LlmModelInfoDto _self;
  final $Res Function(_LlmModelInfoDto) _then;

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? provider = null,
    Object? modelType = null,
    Object? modelName = null,
    Object? parameters = null,
    Object? apiKeyId = freezed,
    Object? embeddingDimensions = freezed,
    Object? isDefault = null,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? endpointUrl = freezed,
    Object? authMethod = freezed,
    Object? authConfig = freezed,
    Object? timeoutMs = freezed,
  }) {
    return _then(
      _LlmModelInfoDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        provider: null == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as String,
        modelType: null == modelType
            ? _self.modelType
            : modelType // ignore: cast_nullable_to_non_nullable
                  as String,
        modelName: null == modelName
            ? _self.modelName
            : modelName // ignore: cast_nullable_to_non_nullable
                  as String,
        parameters: null == parameters
            ? _self.parameters
            : parameters // ignore: cast_nullable_to_non_nullable
                  as LlmParametersDto,
        apiKeyId: freezed == apiKeyId
            ? _self.apiKeyId
            : apiKeyId // ignore: cast_nullable_to_non_nullable
                  as String?,
        embeddingDimensions: freezed == embeddingDimensions
            ? _self.embeddingDimensions
            : embeddingDimensions // ignore: cast_nullable_to_non_nullable
                  as int?,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        endpointUrl: freezed == endpointUrl
            ? _self.endpointUrl
            : endpointUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        authMethod: freezed == authMethod
            ? _self.authMethod
            : authMethod // ignore: cast_nullable_to_non_nullable
                  as String?,
        authConfig: freezed == authConfig
            ? _self._authConfig
            : authConfig // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        timeoutMs: freezed == timeoutMs
            ? _self.timeoutMs
            : timeoutMs // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }

  /// Create a copy of LlmModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $LlmParametersDtoCopyWith<$Res> get parameters {
    return $LlmParametersDtoCopyWith<$Res>(_self.parameters, (value) {
      return _then(_self.copyWith(parameters: value));
    });
  }
}

/// @nodoc
mixin _$PrivateCloudServerInfoDto {
  List<String> get models;
  String? get status;
  String? get version;

  /// Create a copy of PrivateCloudServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $PrivateCloudServerInfoDtoCopyWith<PrivateCloudServerInfoDto> get copyWith =>
      _$PrivateCloudServerInfoDtoCopyWithImpl<PrivateCloudServerInfoDto>(
        this as PrivateCloudServerInfoDto,
        _$identity,
      );

  /// Serializes this PrivateCloudServerInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is PrivateCloudServerInfoDto &&
            const DeepCollectionEquality().equals(other.models, models) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.version, version) || other.version == version));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(models),
    status,
    version,
  );

  @override
  String toString() {
    return 'PrivateCloudServerInfoDto(models: $models, status: $status, version: $version)';
  }
}

/// @nodoc
abstract mixin class $PrivateCloudServerInfoDtoCopyWith<$Res> {
  factory $PrivateCloudServerInfoDtoCopyWith(
    PrivateCloudServerInfoDto value,
    $Res Function(PrivateCloudServerInfoDto) _then,
  ) = _$PrivateCloudServerInfoDtoCopyWithImpl;
  @useResult
  $Res call({List<String> models, String? status, String? version});
}

/// @nodoc
class _$PrivateCloudServerInfoDtoCopyWithImpl<$Res>
    implements $PrivateCloudServerInfoDtoCopyWith<$Res> {
  _$PrivateCloudServerInfoDtoCopyWithImpl(this._self, this._then);

  final PrivateCloudServerInfoDto _self;
  final $Res Function(PrivateCloudServerInfoDto) _then;

  /// Create a copy of PrivateCloudServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? models = null,
    Object? status = freezed,
    Object? version = freezed,
  }) {
    return _then(
      _self.copyWith(
        models: null == models
            ? _self.models
            : models // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [PrivateCloudServerInfoDto].
extension PrivateCloudServerInfoDtoPatterns on PrivateCloudServerInfoDto {
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
    TResult Function(_PrivateCloudServerInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto() when $default != null:
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
    TResult Function(_PrivateCloudServerInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto():
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
    TResult? Function(_PrivateCloudServerInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto() when $default != null:
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
    TResult Function(List<String> models, String? status, String? version)?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto() when $default != null:
        return $default(_that.models, _that.status, _that.version);
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
    TResult Function(List<String> models, String? status, String? version)
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto():
        return $default(_that.models, _that.status, _that.version);
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
    TResult? Function(List<String> models, String? status, String? version)?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudServerInfoDto() when $default != null:
        return $default(_that.models, _that.status, _that.version);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _PrivateCloudServerInfoDto implements PrivateCloudServerInfoDto {
  const _PrivateCloudServerInfoDto({
    final List<String> models = const <String>[],
    this.status,
    this.version,
  }) : _models = models;
  factory _PrivateCloudServerInfoDto.fromJson(Map<String, dynamic> json) =>
      _$PrivateCloudServerInfoDtoFromJson(json);

  final List<String> _models;
  @override
  @JsonKey()
  List<String> get models {
    if (_models is EqualUnmodifiableListView) return _models;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_models);
  }

  @override
  final String? status;
  @override
  final String? version;

  /// Create a copy of PrivateCloudServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$PrivateCloudServerInfoDtoCopyWith<_PrivateCloudServerInfoDto>
  get copyWith =>
      __$PrivateCloudServerInfoDtoCopyWithImpl<_PrivateCloudServerInfoDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$PrivateCloudServerInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _PrivateCloudServerInfoDto &&
            const DeepCollectionEquality().equals(other._models, _models) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.version, version) || other.version == version));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(_models),
    status,
    version,
  );

  @override
  String toString() {
    return 'PrivateCloudServerInfoDto(models: $models, status: $status, version: $version)';
  }
}

/// @nodoc
abstract mixin class _$PrivateCloudServerInfoDtoCopyWith<$Res>
    implements $PrivateCloudServerInfoDtoCopyWith<$Res> {
  factory _$PrivateCloudServerInfoDtoCopyWith(
    _PrivateCloudServerInfoDto value,
    $Res Function(_PrivateCloudServerInfoDto) _then,
  ) = __$PrivateCloudServerInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({List<String> models, String? status, String? version});
}

/// @nodoc
class __$PrivateCloudServerInfoDtoCopyWithImpl<$Res>
    implements _$PrivateCloudServerInfoDtoCopyWith<$Res> {
  __$PrivateCloudServerInfoDtoCopyWithImpl(this._self, this._then);

  final _PrivateCloudServerInfoDto _self;
  final $Res Function(_PrivateCloudServerInfoDto) _then;

  /// Create a copy of PrivateCloudServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? models = null,
    Object? status = freezed,
    Object? version = freezed,
  }) {
    return _then(
      _PrivateCloudServerInfoDto(
        models: null == models
            ? _self._models
            : models // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$TestLlmConnectionResultDto {
  bool get success;
  int get latencyMs;
  PrivateCloudServerInfoDto? get serverInfo;

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $TestLlmConnectionResultDtoCopyWith<TestLlmConnectionResultDto>
  get copyWith =>
      _$TestLlmConnectionResultDtoCopyWithImpl<TestLlmConnectionResultDto>(
        this as TestLlmConnectionResultDto,
        _$identity,
      );

  /// Serializes this TestLlmConnectionResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is TestLlmConnectionResultDto &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.latencyMs, latencyMs) ||
                other.latencyMs == latencyMs) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, success, latencyMs, serverInfo);

  @override
  String toString() {
    return 'TestLlmConnectionResultDto(success: $success, latencyMs: $latencyMs, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class $TestLlmConnectionResultDtoCopyWith<$Res> {
  factory $TestLlmConnectionResultDtoCopyWith(
    TestLlmConnectionResultDto value,
    $Res Function(TestLlmConnectionResultDto) _then,
  ) = _$TestLlmConnectionResultDtoCopyWithImpl;
  @useResult
  $Res call({
    bool success,
    int latencyMs,
    PrivateCloudServerInfoDto? serverInfo,
  });

  $PrivateCloudServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class _$TestLlmConnectionResultDtoCopyWithImpl<$Res>
    implements $TestLlmConnectionResultDtoCopyWith<$Res> {
  _$TestLlmConnectionResultDtoCopyWithImpl(this._self, this._then);

  final TestLlmConnectionResultDto _self;
  final $Res Function(TestLlmConnectionResultDto) _then;

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? latencyMs = null,
    Object? serverInfo = freezed,
  }) {
    return _then(
      _self.copyWith(
        success: null == success
            ? _self.success
            : success // ignore: cast_nullable_to_non_nullable
                  as bool,
        latencyMs: null == latencyMs
            ? _self.latencyMs
            : latencyMs // ignore: cast_nullable_to_non_nullable
                  as int,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as PrivateCloudServerInfoDto?,
      ),
    );
  }

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $PrivateCloudServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $PrivateCloudServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// Adds pattern-matching-related methods to [TestLlmConnectionResultDto].
extension TestLlmConnectionResultDtoPatterns on TestLlmConnectionResultDto {
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
    TResult Function(_TestLlmConnectionResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto() when $default != null:
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
    TResult Function(_TestLlmConnectionResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto():
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
    TResult? Function(_TestLlmConnectionResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto() when $default != null:
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
      bool success,
      int latencyMs,
      PrivateCloudServerInfoDto? serverInfo,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto() when $default != null:
        return $default(_that.success, _that.latencyMs, _that.serverInfo);
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
      bool success,
      int latencyMs,
      PrivateCloudServerInfoDto? serverInfo,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto():
        return $default(_that.success, _that.latencyMs, _that.serverInfo);
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
      bool success,
      int latencyMs,
      PrivateCloudServerInfoDto? serverInfo,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestLlmConnectionResultDto() when $default != null:
        return $default(_that.success, _that.latencyMs, _that.serverInfo);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _TestLlmConnectionResultDto implements TestLlmConnectionResultDto {
  const _TestLlmConnectionResultDto({
    required this.success,
    required this.latencyMs,
    this.serverInfo,
  });
  factory _TestLlmConnectionResultDto.fromJson(Map<String, dynamic> json) =>
      _$TestLlmConnectionResultDtoFromJson(json);

  @override
  final bool success;
  @override
  final int latencyMs;
  @override
  final PrivateCloudServerInfoDto? serverInfo;

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$TestLlmConnectionResultDtoCopyWith<_TestLlmConnectionResultDto>
  get copyWith =>
      __$TestLlmConnectionResultDtoCopyWithImpl<_TestLlmConnectionResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$TestLlmConnectionResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _TestLlmConnectionResultDto &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.latencyMs, latencyMs) ||
                other.latencyMs == latencyMs) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, success, latencyMs, serverInfo);

  @override
  String toString() {
    return 'TestLlmConnectionResultDto(success: $success, latencyMs: $latencyMs, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class _$TestLlmConnectionResultDtoCopyWith<$Res>
    implements $TestLlmConnectionResultDtoCopyWith<$Res> {
  factory _$TestLlmConnectionResultDtoCopyWith(
    _TestLlmConnectionResultDto value,
    $Res Function(_TestLlmConnectionResultDto) _then,
  ) = __$TestLlmConnectionResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    bool success,
    int latencyMs,
    PrivateCloudServerInfoDto? serverInfo,
  });

  @override
  $PrivateCloudServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class __$TestLlmConnectionResultDtoCopyWithImpl<$Res>
    implements _$TestLlmConnectionResultDtoCopyWith<$Res> {
  __$TestLlmConnectionResultDtoCopyWithImpl(this._self, this._then);

  final _TestLlmConnectionResultDto _self;
  final $Res Function(_TestLlmConnectionResultDto) _then;

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? success = null,
    Object? latencyMs = null,
    Object? serverInfo = freezed,
  }) {
    return _then(
      _TestLlmConnectionResultDto(
        success: null == success
            ? _self.success
            : success // ignore: cast_nullable_to_non_nullable
                  as bool,
        latencyMs: null == latencyMs
            ? _self.latencyMs
            : latencyMs // ignore: cast_nullable_to_non_nullable
                  as int,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as PrivateCloudServerInfoDto?,
      ),
    );
  }

  /// Create a copy of TestLlmConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $PrivateCloudServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $PrivateCloudServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// @nodoc
mixin _$PrivateCloudModelInfoDto {
  String get id;
  String get name;
  String? get ownedBy;

  /// Create a copy of PrivateCloudModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $PrivateCloudModelInfoDtoCopyWith<PrivateCloudModelInfoDto> get copyWith =>
      _$PrivateCloudModelInfoDtoCopyWithImpl<PrivateCloudModelInfoDto>(
        this as PrivateCloudModelInfoDto,
        _$identity,
      );

  /// Serializes this PrivateCloudModelInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is PrivateCloudModelInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.ownedBy, ownedBy) || other.ownedBy == ownedBy));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, ownedBy);

  @override
  String toString() {
    return 'PrivateCloudModelInfoDto(id: $id, name: $name, ownedBy: $ownedBy)';
  }
}

/// @nodoc
abstract mixin class $PrivateCloudModelInfoDtoCopyWith<$Res> {
  factory $PrivateCloudModelInfoDtoCopyWith(
    PrivateCloudModelInfoDto value,
    $Res Function(PrivateCloudModelInfoDto) _then,
  ) = _$PrivateCloudModelInfoDtoCopyWithImpl;
  @useResult
  $Res call({String id, String name, String? ownedBy});
}

/// @nodoc
class _$PrivateCloudModelInfoDtoCopyWithImpl<$Res>
    implements $PrivateCloudModelInfoDtoCopyWith<$Res> {
  _$PrivateCloudModelInfoDtoCopyWithImpl(this._self, this._then);

  final PrivateCloudModelInfoDto _self;
  final $Res Function(PrivateCloudModelInfoDto) _then;

  /// Create a copy of PrivateCloudModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? ownedBy = freezed,
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
        ownedBy: freezed == ownedBy
            ? _self.ownedBy
            : ownedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [PrivateCloudModelInfoDto].
extension PrivateCloudModelInfoDtoPatterns on PrivateCloudModelInfoDto {
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
    TResult Function(_PrivateCloudModelInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto() when $default != null:
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
    TResult Function(_PrivateCloudModelInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto():
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
    TResult? Function(_PrivateCloudModelInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto() when $default != null:
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
    TResult Function(String id, String name, String? ownedBy)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto() when $default != null:
        return $default(_that.id, _that.name, _that.ownedBy);
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
    TResult Function(String id, String name, String? ownedBy) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto():
        return $default(_that.id, _that.name, _that.ownedBy);
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
    TResult? Function(String id, String name, String? ownedBy)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PrivateCloudModelInfoDto() when $default != null:
        return $default(_that.id, _that.name, _that.ownedBy);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _PrivateCloudModelInfoDto implements PrivateCloudModelInfoDto {
  const _PrivateCloudModelInfoDto({
    required this.id,
    required this.name,
    this.ownedBy,
  });
  factory _PrivateCloudModelInfoDto.fromJson(Map<String, dynamic> json) =>
      _$PrivateCloudModelInfoDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String? ownedBy;

  /// Create a copy of PrivateCloudModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$PrivateCloudModelInfoDtoCopyWith<_PrivateCloudModelInfoDto> get copyWith =>
      __$PrivateCloudModelInfoDtoCopyWithImpl<_PrivateCloudModelInfoDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$PrivateCloudModelInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _PrivateCloudModelInfoDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.ownedBy, ownedBy) || other.ownedBy == ownedBy));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, ownedBy);

  @override
  String toString() {
    return 'PrivateCloudModelInfoDto(id: $id, name: $name, ownedBy: $ownedBy)';
  }
}

/// @nodoc
abstract mixin class _$PrivateCloudModelInfoDtoCopyWith<$Res>
    implements $PrivateCloudModelInfoDtoCopyWith<$Res> {
  factory _$PrivateCloudModelInfoDtoCopyWith(
    _PrivateCloudModelInfoDto value,
    $Res Function(_PrivateCloudModelInfoDto) _then,
  ) = __$PrivateCloudModelInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({String id, String name, String? ownedBy});
}

/// @nodoc
class __$PrivateCloudModelInfoDtoCopyWithImpl<$Res>
    implements _$PrivateCloudModelInfoDtoCopyWith<$Res> {
  __$PrivateCloudModelInfoDtoCopyWithImpl(this._self, this._then);

  final _PrivateCloudModelInfoDto _self;
  final $Res Function(_PrivateCloudModelInfoDto) _then;

  /// Create a copy of PrivateCloudModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? ownedBy = freezed,
  }) {
    return _then(
      _PrivateCloudModelInfoDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        ownedBy: freezed == ownedBy
            ? _self.ownedBy
            : ownedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$LlmProviderEntityDto {
  String get id;
  String get orgId;
  String get tenantId;
  String get slug;
  String get name;
  String? get iconUrl;
  String? get baseUrl;
  String? get defaultBaseUrl;
  bool get isBuiltin;
  bool get isEnabled;
  String get apiProtocol;
  String? get apiKeyId;
  int get sortOrder;
  String get createdAt;
  String get updatedAt;

  /// Create a copy of LlmProviderEntityDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LlmProviderEntityDtoCopyWith<LlmProviderEntityDto> get copyWith =>
      _$LlmProviderEntityDtoCopyWithImpl<LlmProviderEntityDto>(
        this as LlmProviderEntityDto,
        _$identity,
      );

  /// Serializes this LlmProviderEntityDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LlmProviderEntityDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.orgId, orgId) || other.orgId == orgId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.iconUrl, iconUrl) || other.iconUrl == iconUrl) &&
            (identical(other.baseUrl, baseUrl) || other.baseUrl == baseUrl) &&
            (identical(other.defaultBaseUrl, defaultBaseUrl) ||
                other.defaultBaseUrl == defaultBaseUrl) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin) &&
            (identical(other.isEnabled, isEnabled) ||
                other.isEnabled == isEnabled) &&
            (identical(other.apiProtocol, apiProtocol) ||
                other.apiProtocol == apiProtocol) &&
            (identical(other.apiKeyId, apiKeyId) ||
                other.apiKeyId == apiKeyId) &&
            (identical(other.sortOrder, sortOrder) ||
                other.sortOrder == sortOrder) &&
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
    orgId,
    tenantId,
    slug,
    name,
    iconUrl,
    baseUrl,
    defaultBaseUrl,
    isBuiltin,
    isEnabled,
    apiProtocol,
    apiKeyId,
    sortOrder,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'LlmProviderEntityDto(id: $id, orgId: $orgId, tenantId: $tenantId, slug: $slug, name: $name, iconUrl: $iconUrl, baseUrl: $baseUrl, defaultBaseUrl: $defaultBaseUrl, isBuiltin: $isBuiltin, isEnabled: $isEnabled, apiProtocol: $apiProtocol, apiKeyId: $apiKeyId, sortOrder: $sortOrder, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $LlmProviderEntityDtoCopyWith<$Res> {
  factory $LlmProviderEntityDtoCopyWith(
    LlmProviderEntityDto value,
    $Res Function(LlmProviderEntityDto) _then,
  ) = _$LlmProviderEntityDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String orgId,
    String tenantId,
    String slug,
    String name,
    String? iconUrl,
    String? baseUrl,
    String? defaultBaseUrl,
    bool isBuiltin,
    bool isEnabled,
    String apiProtocol,
    String? apiKeyId,
    int sortOrder,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$LlmProviderEntityDtoCopyWithImpl<$Res>
    implements $LlmProviderEntityDtoCopyWith<$Res> {
  _$LlmProviderEntityDtoCopyWithImpl(this._self, this._then);

  final LlmProviderEntityDto _self;
  final $Res Function(LlmProviderEntityDto) _then;

  /// Create a copy of LlmProviderEntityDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? orgId = null,
    Object? tenantId = null,
    Object? slug = null,
    Object? name = null,
    Object? iconUrl = freezed,
    Object? baseUrl = freezed,
    Object? defaultBaseUrl = freezed,
    Object? isBuiltin = null,
    Object? isEnabled = null,
    Object? apiProtocol = null,
    Object? apiKeyId = freezed,
    Object? sortOrder = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        orgId: null == orgId
            ? _self.orgId
            : orgId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        iconUrl: freezed == iconUrl
            ? _self.iconUrl
            : iconUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        baseUrl: freezed == baseUrl
            ? _self.baseUrl
            : baseUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        defaultBaseUrl: freezed == defaultBaseUrl
            ? _self.defaultBaseUrl
            : defaultBaseUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        isBuiltin: null == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool,
        isEnabled: null == isEnabled
            ? _self.isEnabled
            : isEnabled // ignore: cast_nullable_to_non_nullable
                  as bool,
        apiProtocol: null == apiProtocol
            ? _self.apiProtocol
            : apiProtocol // ignore: cast_nullable_to_non_nullable
                  as String,
        apiKeyId: freezed == apiKeyId
            ? _self.apiKeyId
            : apiKeyId // ignore: cast_nullable_to_non_nullable
                  as String?,
        sortOrder: null == sortOrder
            ? _self.sortOrder
            : sortOrder // ignore: cast_nullable_to_non_nullable
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

/// Adds pattern-matching-related methods to [LlmProviderEntityDto].
extension LlmProviderEntityDtoPatterns on LlmProviderEntityDto {
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
    TResult Function(_LlmProviderEntityDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto() when $default != null:
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
    TResult Function(_LlmProviderEntityDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto():
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
    TResult? Function(_LlmProviderEntityDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto() when $default != null:
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
      String orgId,
      String tenantId,
      String slug,
      String name,
      String? iconUrl,
      String? baseUrl,
      String? defaultBaseUrl,
      bool isBuiltin,
      bool isEnabled,
      String apiProtocol,
      String? apiKeyId,
      int sortOrder,
      String createdAt,
      String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto() when $default != null:
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.slug,
          _that.name,
          _that.iconUrl,
          _that.baseUrl,
          _that.defaultBaseUrl,
          _that.isBuiltin,
          _that.isEnabled,
          _that.apiProtocol,
          _that.apiKeyId,
          _that.sortOrder,
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
      String orgId,
      String tenantId,
      String slug,
      String name,
      String? iconUrl,
      String? baseUrl,
      String? defaultBaseUrl,
      bool isBuiltin,
      bool isEnabled,
      String apiProtocol,
      String? apiKeyId,
      int sortOrder,
      String createdAt,
      String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto():
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.slug,
          _that.name,
          _that.iconUrl,
          _that.baseUrl,
          _that.defaultBaseUrl,
          _that.isBuiltin,
          _that.isEnabled,
          _that.apiProtocol,
          _that.apiKeyId,
          _that.sortOrder,
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
      String orgId,
      String tenantId,
      String slug,
      String name,
      String? iconUrl,
      String? baseUrl,
      String? defaultBaseUrl,
      bool isBuiltin,
      bool isEnabled,
      String apiProtocol,
      String? apiKeyId,
      int sortOrder,
      String createdAt,
      String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmProviderEntityDto() when $default != null:
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.slug,
          _that.name,
          _that.iconUrl,
          _that.baseUrl,
          _that.defaultBaseUrl,
          _that.isBuiltin,
          _that.isEnabled,
          _that.apiProtocol,
          _that.apiKeyId,
          _that.sortOrder,
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
class _LlmProviderEntityDto implements LlmProviderEntityDto {
  const _LlmProviderEntityDto({
    required this.id,
    required this.orgId,
    required this.tenantId,
    required this.slug,
    required this.name,
    this.iconUrl,
    this.baseUrl,
    this.defaultBaseUrl,
    this.isBuiltin = false,
    this.isEnabled = true,
    this.apiProtocol = 'openai_chat',
    this.apiKeyId,
    this.sortOrder = 0,
    required this.createdAt,
    required this.updatedAt,
  });
  factory _LlmProviderEntityDto.fromJson(Map<String, dynamic> json) =>
      _$LlmProviderEntityDtoFromJson(json);

  @override
  final String id;
  @override
  final String orgId;
  @override
  final String tenantId;
  @override
  final String slug;
  @override
  final String name;
  @override
  final String? iconUrl;
  @override
  final String? baseUrl;
  @override
  final String? defaultBaseUrl;
  @override
  @JsonKey()
  final bool isBuiltin;
  @override
  @JsonKey()
  final bool isEnabled;
  @override
  @JsonKey()
  final String apiProtocol;
  @override
  final String? apiKeyId;
  @override
  @JsonKey()
  final int sortOrder;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  /// Create a copy of LlmProviderEntityDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LlmProviderEntityDtoCopyWith<_LlmProviderEntityDto> get copyWith =>
      __$LlmProviderEntityDtoCopyWithImpl<_LlmProviderEntityDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$LlmProviderEntityDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LlmProviderEntityDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.orgId, orgId) || other.orgId == orgId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.iconUrl, iconUrl) || other.iconUrl == iconUrl) &&
            (identical(other.baseUrl, baseUrl) || other.baseUrl == baseUrl) &&
            (identical(other.defaultBaseUrl, defaultBaseUrl) ||
                other.defaultBaseUrl == defaultBaseUrl) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin) &&
            (identical(other.isEnabled, isEnabled) ||
                other.isEnabled == isEnabled) &&
            (identical(other.apiProtocol, apiProtocol) ||
                other.apiProtocol == apiProtocol) &&
            (identical(other.apiKeyId, apiKeyId) ||
                other.apiKeyId == apiKeyId) &&
            (identical(other.sortOrder, sortOrder) ||
                other.sortOrder == sortOrder) &&
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
    orgId,
    tenantId,
    slug,
    name,
    iconUrl,
    baseUrl,
    defaultBaseUrl,
    isBuiltin,
    isEnabled,
    apiProtocol,
    apiKeyId,
    sortOrder,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'LlmProviderEntityDto(id: $id, orgId: $orgId, tenantId: $tenantId, slug: $slug, name: $name, iconUrl: $iconUrl, baseUrl: $baseUrl, defaultBaseUrl: $defaultBaseUrl, isBuiltin: $isBuiltin, isEnabled: $isEnabled, apiProtocol: $apiProtocol, apiKeyId: $apiKeyId, sortOrder: $sortOrder, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$LlmProviderEntityDtoCopyWith<$Res>
    implements $LlmProviderEntityDtoCopyWith<$Res> {
  factory _$LlmProviderEntityDtoCopyWith(
    _LlmProviderEntityDto value,
    $Res Function(_LlmProviderEntityDto) _then,
  ) = __$LlmProviderEntityDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String orgId,
    String tenantId,
    String slug,
    String name,
    String? iconUrl,
    String? baseUrl,
    String? defaultBaseUrl,
    bool isBuiltin,
    bool isEnabled,
    String apiProtocol,
    String? apiKeyId,
    int sortOrder,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$LlmProviderEntityDtoCopyWithImpl<$Res>
    implements _$LlmProviderEntityDtoCopyWith<$Res> {
  __$LlmProviderEntityDtoCopyWithImpl(this._self, this._then);

  final _LlmProviderEntityDto _self;
  final $Res Function(_LlmProviderEntityDto) _then;

  /// Create a copy of LlmProviderEntityDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? orgId = null,
    Object? tenantId = null,
    Object? slug = null,
    Object? name = null,
    Object? iconUrl = freezed,
    Object? baseUrl = freezed,
    Object? defaultBaseUrl = freezed,
    Object? isBuiltin = null,
    Object? isEnabled = null,
    Object? apiProtocol = null,
    Object? apiKeyId = freezed,
    Object? sortOrder = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _LlmProviderEntityDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        orgId: null == orgId
            ? _self.orgId
            : orgId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        iconUrl: freezed == iconUrl
            ? _self.iconUrl
            : iconUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        baseUrl: freezed == baseUrl
            ? _self.baseUrl
            : baseUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        defaultBaseUrl: freezed == defaultBaseUrl
            ? _self.defaultBaseUrl
            : defaultBaseUrl // ignore: cast_nullable_to_non_nullable
                  as String?,
        isBuiltin: null == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool,
        isEnabled: null == isEnabled
            ? _self.isEnabled
            : isEnabled // ignore: cast_nullable_to_non_nullable
                  as bool,
        apiProtocol: null == apiProtocol
            ? _self.apiProtocol
            : apiProtocol // ignore: cast_nullable_to_non_nullable
                  as String,
        apiKeyId: freezed == apiKeyId
            ? _self.apiKeyId
            : apiKeyId // ignore: cast_nullable_to_non_nullable
                  as String?,
        sortOrder: null == sortOrder
            ? _self.sortOrder
            : sortOrder // ignore: cast_nullable_to_non_nullable
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

/// @nodoc
mixin _$ModelCapabilitiesDto {
  bool get vision;
  bool get functionCalling;
  bool get reasoning;
  bool get structuredOutput;

  /// Create a copy of ModelCapabilitiesDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ModelCapabilitiesDtoCopyWith<ModelCapabilitiesDto> get copyWith =>
      _$ModelCapabilitiesDtoCopyWithImpl<ModelCapabilitiesDto>(
        this as ModelCapabilitiesDto,
        _$identity,
      );

  /// Serializes this ModelCapabilitiesDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ModelCapabilitiesDto &&
            (identical(other.vision, vision) || other.vision == vision) &&
            (identical(other.functionCalling, functionCalling) ||
                other.functionCalling == functionCalling) &&
            (identical(other.reasoning, reasoning) ||
                other.reasoning == reasoning) &&
            (identical(other.structuredOutput, structuredOutput) ||
                other.structuredOutput == structuredOutput));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    vision,
    functionCalling,
    reasoning,
    structuredOutput,
  );

  @override
  String toString() {
    return 'ModelCapabilitiesDto(vision: $vision, functionCalling: $functionCalling, reasoning: $reasoning, structuredOutput: $structuredOutput)';
  }
}

/// @nodoc
abstract mixin class $ModelCapabilitiesDtoCopyWith<$Res> {
  factory $ModelCapabilitiesDtoCopyWith(
    ModelCapabilitiesDto value,
    $Res Function(ModelCapabilitiesDto) _then,
  ) = _$ModelCapabilitiesDtoCopyWithImpl;
  @useResult
  $Res call({
    bool vision,
    bool functionCalling,
    bool reasoning,
    bool structuredOutput,
  });
}

/// @nodoc
class _$ModelCapabilitiesDtoCopyWithImpl<$Res>
    implements $ModelCapabilitiesDtoCopyWith<$Res> {
  _$ModelCapabilitiesDtoCopyWithImpl(this._self, this._then);

  final ModelCapabilitiesDto _self;
  final $Res Function(ModelCapabilitiesDto) _then;

  /// Create a copy of ModelCapabilitiesDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? vision = null,
    Object? functionCalling = null,
    Object? reasoning = null,
    Object? structuredOutput = null,
  }) {
    return _then(
      _self.copyWith(
        vision: null == vision
            ? _self.vision
            : vision // ignore: cast_nullable_to_non_nullable
                  as bool,
        functionCalling: null == functionCalling
            ? _self.functionCalling
            : functionCalling // ignore: cast_nullable_to_non_nullable
                  as bool,
        reasoning: null == reasoning
            ? _self.reasoning
            : reasoning // ignore: cast_nullable_to_non_nullable
                  as bool,
        structuredOutput: null == structuredOutput
            ? _self.structuredOutput
            : structuredOutput // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ModelCapabilitiesDto].
extension ModelCapabilitiesDtoPatterns on ModelCapabilitiesDto {
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
    TResult Function(_ModelCapabilitiesDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto() when $default != null:
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
    TResult Function(_ModelCapabilitiesDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto():
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
    TResult? Function(_ModelCapabilitiesDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto() when $default != null:
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
      bool vision,
      bool functionCalling,
      bool reasoning,
      bool structuredOutput,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto() when $default != null:
        return $default(
          _that.vision,
          _that.functionCalling,
          _that.reasoning,
          _that.structuredOutput,
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
      bool vision,
      bool functionCalling,
      bool reasoning,
      bool structuredOutput,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto():
        return $default(
          _that.vision,
          _that.functionCalling,
          _that.reasoning,
          _that.structuredOutput,
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
      bool vision,
      bool functionCalling,
      bool reasoning,
      bool structuredOutput,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelCapabilitiesDto() when $default != null:
        return $default(
          _that.vision,
          _that.functionCalling,
          _that.reasoning,
          _that.structuredOutput,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ModelCapabilitiesDto implements ModelCapabilitiesDto {
  const _ModelCapabilitiesDto({
    this.vision = false,
    this.functionCalling = false,
    this.reasoning = false,
    this.structuredOutput = false,
  });
  factory _ModelCapabilitiesDto.fromJson(Map<String, dynamic> json) =>
      _$ModelCapabilitiesDtoFromJson(json);

  @override
  @JsonKey()
  final bool vision;
  @override
  @JsonKey()
  final bool functionCalling;
  @override
  @JsonKey()
  final bool reasoning;
  @override
  @JsonKey()
  final bool structuredOutput;

  /// Create a copy of ModelCapabilitiesDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ModelCapabilitiesDtoCopyWith<_ModelCapabilitiesDto> get copyWith =>
      __$ModelCapabilitiesDtoCopyWithImpl<_ModelCapabilitiesDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ModelCapabilitiesDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ModelCapabilitiesDto &&
            (identical(other.vision, vision) || other.vision == vision) &&
            (identical(other.functionCalling, functionCalling) ||
                other.functionCalling == functionCalling) &&
            (identical(other.reasoning, reasoning) ||
                other.reasoning == reasoning) &&
            (identical(other.structuredOutput, structuredOutput) ||
                other.structuredOutput == structuredOutput));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    vision,
    functionCalling,
    reasoning,
    structuredOutput,
  );

  @override
  String toString() {
    return 'ModelCapabilitiesDto(vision: $vision, functionCalling: $functionCalling, reasoning: $reasoning, structuredOutput: $structuredOutput)';
  }
}

/// @nodoc
abstract mixin class _$ModelCapabilitiesDtoCopyWith<$Res>
    implements $ModelCapabilitiesDtoCopyWith<$Res> {
  factory _$ModelCapabilitiesDtoCopyWith(
    _ModelCapabilitiesDto value,
    $Res Function(_ModelCapabilitiesDto) _then,
  ) = __$ModelCapabilitiesDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    bool vision,
    bool functionCalling,
    bool reasoning,
    bool structuredOutput,
  });
}

/// @nodoc
class __$ModelCapabilitiesDtoCopyWithImpl<$Res>
    implements _$ModelCapabilitiesDtoCopyWith<$Res> {
  __$ModelCapabilitiesDtoCopyWithImpl(this._self, this._then);

  final _ModelCapabilitiesDto _self;
  final $Res Function(_ModelCapabilitiesDto) _then;

  /// Create a copy of ModelCapabilitiesDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? vision = null,
    Object? functionCalling = null,
    Object? reasoning = null,
    Object? structuredOutput = null,
  }) {
    return _then(
      _ModelCapabilitiesDto(
        vision: null == vision
            ? _self.vision
            : vision // ignore: cast_nullable_to_non_nullable
                  as bool,
        functionCalling: null == functionCalling
            ? _self.functionCalling
            : functionCalling // ignore: cast_nullable_to_non_nullable
                  as bool,
        reasoning: null == reasoning
            ? _self.reasoning
            : reasoning // ignore: cast_nullable_to_non_nullable
                  as bool,
        structuredOutput: null == structuredOutput
            ? _self.structuredOutput
            : structuredOutput // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// @nodoc
mixin _$PricingTierDto {
  int get aboveTokens;
  double get inputPer1MTokens;
  double get outputPer1MTokens;
  double? get cachedReadPer1MTokens;
  double? get cachedWritePer1MTokens;

  /// Create a copy of PricingTierDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $PricingTierDtoCopyWith<PricingTierDto> get copyWith =>
      _$PricingTierDtoCopyWithImpl<PricingTierDto>(
        this as PricingTierDto,
        _$identity,
      );

  /// Serializes this PricingTierDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is PricingTierDto &&
            (identical(other.aboveTokens, aboveTokens) ||
                other.aboveTokens == aboveTokens) &&
            (identical(other.inputPer1MTokens, inputPer1MTokens) ||
                other.inputPer1MTokens == inputPer1MTokens) &&
            (identical(other.outputPer1MTokens, outputPer1MTokens) ||
                other.outputPer1MTokens == outputPer1MTokens) &&
            (identical(other.cachedReadPer1MTokens, cachedReadPer1MTokens) ||
                other.cachedReadPer1MTokens == cachedReadPer1MTokens) &&
            (identical(other.cachedWritePer1MTokens, cachedWritePer1MTokens) ||
                other.cachedWritePer1MTokens == cachedWritePer1MTokens));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    aboveTokens,
    inputPer1MTokens,
    outputPer1MTokens,
    cachedReadPer1MTokens,
    cachedWritePer1MTokens,
  );

  @override
  String toString() {
    return 'PricingTierDto(aboveTokens: $aboveTokens, inputPer1MTokens: $inputPer1MTokens, outputPer1MTokens: $outputPer1MTokens, cachedReadPer1MTokens: $cachedReadPer1MTokens, cachedWritePer1MTokens: $cachedWritePer1MTokens)';
  }
}

/// @nodoc
abstract mixin class $PricingTierDtoCopyWith<$Res> {
  factory $PricingTierDtoCopyWith(
    PricingTierDto value,
    $Res Function(PricingTierDto) _then,
  ) = _$PricingTierDtoCopyWithImpl;
  @useResult
  $Res call({
    int aboveTokens,
    double inputPer1MTokens,
    double outputPer1MTokens,
    double? cachedReadPer1MTokens,
    double? cachedWritePer1MTokens,
  });
}

/// @nodoc
class _$PricingTierDtoCopyWithImpl<$Res>
    implements $PricingTierDtoCopyWith<$Res> {
  _$PricingTierDtoCopyWithImpl(this._self, this._then);

  final PricingTierDto _self;
  final $Res Function(PricingTierDto) _then;

  /// Create a copy of PricingTierDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? aboveTokens = null,
    Object? inputPer1MTokens = null,
    Object? outputPer1MTokens = null,
    Object? cachedReadPer1MTokens = freezed,
    Object? cachedWritePer1MTokens = freezed,
  }) {
    return _then(
      _self.copyWith(
        aboveTokens: null == aboveTokens
            ? _self.aboveTokens
            : aboveTokens // ignore: cast_nullable_to_non_nullable
                  as int,
        inputPer1MTokens: null == inputPer1MTokens
            ? _self.inputPer1MTokens
            : inputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        outputPer1MTokens: null == outputPer1MTokens
            ? _self.outputPer1MTokens
            : outputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        cachedReadPer1MTokens: freezed == cachedReadPer1MTokens
            ? _self.cachedReadPer1MTokens
            : cachedReadPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        cachedWritePer1MTokens: freezed == cachedWritePer1MTokens
            ? _self.cachedWritePer1MTokens
            : cachedWritePer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [PricingTierDto].
extension PricingTierDtoPatterns on PricingTierDto {
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
    TResult Function(_PricingTierDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto() when $default != null:
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
    TResult Function(_PricingTierDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto():
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
    TResult? Function(_PricingTierDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto() when $default != null:
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
      int aboveTokens,
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto() when $default != null:
        return $default(
          _that.aboveTokens,
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
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
      int aboveTokens,
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto():
        return $default(
          _that.aboveTokens,
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
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
      int aboveTokens,
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PricingTierDto() when $default != null:
        return $default(
          _that.aboveTokens,
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _PricingTierDto implements PricingTierDto {
  const _PricingTierDto({
    required this.aboveTokens,
    required this.inputPer1MTokens,
    required this.outputPer1MTokens,
    this.cachedReadPer1MTokens,
    this.cachedWritePer1MTokens,
  });
  factory _PricingTierDto.fromJson(Map<String, dynamic> json) =>
      _$PricingTierDtoFromJson(json);

  @override
  final int aboveTokens;
  @override
  final double inputPer1MTokens;
  @override
  final double outputPer1MTokens;
  @override
  final double? cachedReadPer1MTokens;
  @override
  final double? cachedWritePer1MTokens;

  /// Create a copy of PricingTierDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$PricingTierDtoCopyWith<_PricingTierDto> get copyWith =>
      __$PricingTierDtoCopyWithImpl<_PricingTierDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$PricingTierDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _PricingTierDto &&
            (identical(other.aboveTokens, aboveTokens) ||
                other.aboveTokens == aboveTokens) &&
            (identical(other.inputPer1MTokens, inputPer1MTokens) ||
                other.inputPer1MTokens == inputPer1MTokens) &&
            (identical(other.outputPer1MTokens, outputPer1MTokens) ||
                other.outputPer1MTokens == outputPer1MTokens) &&
            (identical(other.cachedReadPer1MTokens, cachedReadPer1MTokens) ||
                other.cachedReadPer1MTokens == cachedReadPer1MTokens) &&
            (identical(other.cachedWritePer1MTokens, cachedWritePer1MTokens) ||
                other.cachedWritePer1MTokens == cachedWritePer1MTokens));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    aboveTokens,
    inputPer1MTokens,
    outputPer1MTokens,
    cachedReadPer1MTokens,
    cachedWritePer1MTokens,
  );

  @override
  String toString() {
    return 'PricingTierDto(aboveTokens: $aboveTokens, inputPer1MTokens: $inputPer1MTokens, outputPer1MTokens: $outputPer1MTokens, cachedReadPer1MTokens: $cachedReadPer1MTokens, cachedWritePer1MTokens: $cachedWritePer1MTokens)';
  }
}

/// @nodoc
abstract mixin class _$PricingTierDtoCopyWith<$Res>
    implements $PricingTierDtoCopyWith<$Res> {
  factory _$PricingTierDtoCopyWith(
    _PricingTierDto value,
    $Res Function(_PricingTierDto) _then,
  ) = __$PricingTierDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    int aboveTokens,
    double inputPer1MTokens,
    double outputPer1MTokens,
    double? cachedReadPer1MTokens,
    double? cachedWritePer1MTokens,
  });
}

/// @nodoc
class __$PricingTierDtoCopyWithImpl<$Res>
    implements _$PricingTierDtoCopyWith<$Res> {
  __$PricingTierDtoCopyWithImpl(this._self, this._then);

  final _PricingTierDto _self;
  final $Res Function(_PricingTierDto) _then;

  /// Create a copy of PricingTierDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? aboveTokens = null,
    Object? inputPer1MTokens = null,
    Object? outputPer1MTokens = null,
    Object? cachedReadPer1MTokens = freezed,
    Object? cachedWritePer1MTokens = freezed,
  }) {
    return _then(
      _PricingTierDto(
        aboveTokens: null == aboveTokens
            ? _self.aboveTokens
            : aboveTokens // ignore: cast_nullable_to_non_nullable
                  as int,
        inputPer1MTokens: null == inputPer1MTokens
            ? _self.inputPer1MTokens
            : inputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        outputPer1MTokens: null == outputPer1MTokens
            ? _self.outputPer1MTokens
            : outputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        cachedReadPer1MTokens: freezed == cachedReadPer1MTokens
            ? _self.cachedReadPer1MTokens
            : cachedReadPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        cachedWritePer1MTokens: freezed == cachedWritePer1MTokens
            ? _self.cachedWritePer1MTokens
            : cachedWritePer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
      ),
    );
  }
}

/// @nodoc
mixin _$ModelPricingDto {
  double get inputPer1MTokens;
  double get outputPer1MTokens;
  double? get cachedReadPer1MTokens;
  double? get cachedWritePer1MTokens;
  List<PricingTierDto> get tiers;

  /// Create a copy of ModelPricingDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ModelPricingDtoCopyWith<ModelPricingDto> get copyWith =>
      _$ModelPricingDtoCopyWithImpl<ModelPricingDto>(
        this as ModelPricingDto,
        _$identity,
      );

  /// Serializes this ModelPricingDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ModelPricingDto &&
            (identical(other.inputPer1MTokens, inputPer1MTokens) ||
                other.inputPer1MTokens == inputPer1MTokens) &&
            (identical(other.outputPer1MTokens, outputPer1MTokens) ||
                other.outputPer1MTokens == outputPer1MTokens) &&
            (identical(other.cachedReadPer1MTokens, cachedReadPer1MTokens) ||
                other.cachedReadPer1MTokens == cachedReadPer1MTokens) &&
            (identical(other.cachedWritePer1MTokens, cachedWritePer1MTokens) ||
                other.cachedWritePer1MTokens == cachedWritePer1MTokens) &&
            const DeepCollectionEquality().equals(other.tiers, tiers));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    inputPer1MTokens,
    outputPer1MTokens,
    cachedReadPer1MTokens,
    cachedWritePer1MTokens,
    const DeepCollectionEquality().hash(tiers),
  );

  @override
  String toString() {
    return 'ModelPricingDto(inputPer1MTokens: $inputPer1MTokens, outputPer1MTokens: $outputPer1MTokens, cachedReadPer1MTokens: $cachedReadPer1MTokens, cachedWritePer1MTokens: $cachedWritePer1MTokens, tiers: $tiers)';
  }
}

/// @nodoc
abstract mixin class $ModelPricingDtoCopyWith<$Res> {
  factory $ModelPricingDtoCopyWith(
    ModelPricingDto value,
    $Res Function(ModelPricingDto) _then,
  ) = _$ModelPricingDtoCopyWithImpl;
  @useResult
  $Res call({
    double inputPer1MTokens,
    double outputPer1MTokens,
    double? cachedReadPer1MTokens,
    double? cachedWritePer1MTokens,
    List<PricingTierDto> tiers,
  });
}

/// @nodoc
class _$ModelPricingDtoCopyWithImpl<$Res>
    implements $ModelPricingDtoCopyWith<$Res> {
  _$ModelPricingDtoCopyWithImpl(this._self, this._then);

  final ModelPricingDto _self;
  final $Res Function(ModelPricingDto) _then;

  /// Create a copy of ModelPricingDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? inputPer1MTokens = null,
    Object? outputPer1MTokens = null,
    Object? cachedReadPer1MTokens = freezed,
    Object? cachedWritePer1MTokens = freezed,
    Object? tiers = null,
  }) {
    return _then(
      _self.copyWith(
        inputPer1MTokens: null == inputPer1MTokens
            ? _self.inputPer1MTokens
            : inputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        outputPer1MTokens: null == outputPer1MTokens
            ? _self.outputPer1MTokens
            : outputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        cachedReadPer1MTokens: freezed == cachedReadPer1MTokens
            ? _self.cachedReadPer1MTokens
            : cachedReadPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        cachedWritePer1MTokens: freezed == cachedWritePer1MTokens
            ? _self.cachedWritePer1MTokens
            : cachedWritePer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        tiers: null == tiers
            ? _self.tiers
            : tiers // ignore: cast_nullable_to_non_nullable
                  as List<PricingTierDto>,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ModelPricingDto].
extension ModelPricingDtoPatterns on ModelPricingDto {
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
    TResult Function(_ModelPricingDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto() when $default != null:
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
    TResult Function(_ModelPricingDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto():
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
    TResult? Function(_ModelPricingDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto() when $default != null:
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
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
      List<PricingTierDto> tiers,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto() when $default != null:
        return $default(
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
          _that.tiers,
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
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
      List<PricingTierDto> tiers,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto():
        return $default(
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
          _that.tiers,
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
      double inputPer1MTokens,
      double outputPer1MTokens,
      double? cachedReadPer1MTokens,
      double? cachedWritePer1MTokens,
      List<PricingTierDto> tiers,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ModelPricingDto() when $default != null:
        return $default(
          _that.inputPer1MTokens,
          _that.outputPer1MTokens,
          _that.cachedReadPer1MTokens,
          _that.cachedWritePer1MTokens,
          _that.tiers,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ModelPricingDto implements ModelPricingDto {
  const _ModelPricingDto({
    required this.inputPer1MTokens,
    required this.outputPer1MTokens,
    this.cachedReadPer1MTokens,
    this.cachedWritePer1MTokens,
    final List<PricingTierDto> tiers = const <PricingTierDto>[],
  }) : _tiers = tiers;
  factory _ModelPricingDto.fromJson(Map<String, dynamic> json) =>
      _$ModelPricingDtoFromJson(json);

  @override
  final double inputPer1MTokens;
  @override
  final double outputPer1MTokens;
  @override
  final double? cachedReadPer1MTokens;
  @override
  final double? cachedWritePer1MTokens;
  final List<PricingTierDto> _tiers;
  @override
  @JsonKey()
  List<PricingTierDto> get tiers {
    if (_tiers is EqualUnmodifiableListView) return _tiers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_tiers);
  }

  /// Create a copy of ModelPricingDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ModelPricingDtoCopyWith<_ModelPricingDto> get copyWith =>
      __$ModelPricingDtoCopyWithImpl<_ModelPricingDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ModelPricingDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ModelPricingDto &&
            (identical(other.inputPer1MTokens, inputPer1MTokens) ||
                other.inputPer1MTokens == inputPer1MTokens) &&
            (identical(other.outputPer1MTokens, outputPer1MTokens) ||
                other.outputPer1MTokens == outputPer1MTokens) &&
            (identical(other.cachedReadPer1MTokens, cachedReadPer1MTokens) ||
                other.cachedReadPer1MTokens == cachedReadPer1MTokens) &&
            (identical(other.cachedWritePer1MTokens, cachedWritePer1MTokens) ||
                other.cachedWritePer1MTokens == cachedWritePer1MTokens) &&
            const DeepCollectionEquality().equals(other._tiers, _tiers));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    inputPer1MTokens,
    outputPer1MTokens,
    cachedReadPer1MTokens,
    cachedWritePer1MTokens,
    const DeepCollectionEquality().hash(_tiers),
  );

  @override
  String toString() {
    return 'ModelPricingDto(inputPer1MTokens: $inputPer1MTokens, outputPer1MTokens: $outputPer1MTokens, cachedReadPer1MTokens: $cachedReadPer1MTokens, cachedWritePer1MTokens: $cachedWritePer1MTokens, tiers: $tiers)';
  }
}

/// @nodoc
abstract mixin class _$ModelPricingDtoCopyWith<$Res>
    implements $ModelPricingDtoCopyWith<$Res> {
  factory _$ModelPricingDtoCopyWith(
    _ModelPricingDto value,
    $Res Function(_ModelPricingDto) _then,
  ) = __$ModelPricingDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    double inputPer1MTokens,
    double outputPer1MTokens,
    double? cachedReadPer1MTokens,
    double? cachedWritePer1MTokens,
    List<PricingTierDto> tiers,
  });
}

/// @nodoc
class __$ModelPricingDtoCopyWithImpl<$Res>
    implements _$ModelPricingDtoCopyWith<$Res> {
  __$ModelPricingDtoCopyWithImpl(this._self, this._then);

  final _ModelPricingDto _self;
  final $Res Function(_ModelPricingDto) _then;

  /// Create a copy of ModelPricingDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? inputPer1MTokens = null,
    Object? outputPer1MTokens = null,
    Object? cachedReadPer1MTokens = freezed,
    Object? cachedWritePer1MTokens = freezed,
    Object? tiers = null,
  }) {
    return _then(
      _ModelPricingDto(
        inputPer1MTokens: null == inputPer1MTokens
            ? _self.inputPer1MTokens
            : inputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        outputPer1MTokens: null == outputPer1MTokens
            ? _self.outputPer1MTokens
            : outputPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double,
        cachedReadPer1MTokens: freezed == cachedReadPer1MTokens
            ? _self.cachedReadPer1MTokens
            : cachedReadPer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        cachedWritePer1MTokens: freezed == cachedWritePer1MTokens
            ? _self.cachedWritePer1MTokens
            : cachedWritePer1MTokens // ignore: cast_nullable_to_non_nullable
                  as double?,
        tiers: null == tiers
            ? _self._tiers
            : tiers // ignore: cast_nullable_to_non_nullable
                  as List<PricingTierDto>,
      ),
    );
  }
}

/// @nodoc
mixin _$LiteLLMModelInfoDto {
  String get modelId;
  int? get contextWindow;
  int? get maxOutputTokens;
  ModelPricingDto? get pricing;
  ModelCapabilitiesDto get capabilities;

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LiteLLMModelInfoDtoCopyWith<LiteLLMModelInfoDto> get copyWith =>
      _$LiteLLMModelInfoDtoCopyWithImpl<LiteLLMModelInfoDto>(
        this as LiteLLMModelInfoDto,
        _$identity,
      );

  /// Serializes this LiteLLMModelInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LiteLLMModelInfoDto &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.contextWindow, contextWindow) ||
                other.contextWindow == contextWindow) &&
            (identical(other.maxOutputTokens, maxOutputTokens) ||
                other.maxOutputTokens == maxOutputTokens) &&
            (identical(other.pricing, pricing) || other.pricing == pricing) &&
            (identical(other.capabilities, capabilities) ||
                other.capabilities == capabilities));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    modelId,
    contextWindow,
    maxOutputTokens,
    pricing,
    capabilities,
  );

  @override
  String toString() {
    return 'LiteLLMModelInfoDto(modelId: $modelId, contextWindow: $contextWindow, maxOutputTokens: $maxOutputTokens, pricing: $pricing, capabilities: $capabilities)';
  }
}

/// @nodoc
abstract mixin class $LiteLLMModelInfoDtoCopyWith<$Res> {
  factory $LiteLLMModelInfoDtoCopyWith(
    LiteLLMModelInfoDto value,
    $Res Function(LiteLLMModelInfoDto) _then,
  ) = _$LiteLLMModelInfoDtoCopyWithImpl;
  @useResult
  $Res call({
    String modelId,
    int? contextWindow,
    int? maxOutputTokens,
    ModelPricingDto? pricing,
    ModelCapabilitiesDto capabilities,
  });

  $ModelPricingDtoCopyWith<$Res>? get pricing;
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities;
}

/// @nodoc
class _$LiteLLMModelInfoDtoCopyWithImpl<$Res>
    implements $LiteLLMModelInfoDtoCopyWith<$Res> {
  _$LiteLLMModelInfoDtoCopyWithImpl(this._self, this._then);

  final LiteLLMModelInfoDto _self;
  final $Res Function(LiteLLMModelInfoDto) _then;

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? modelId = null,
    Object? contextWindow = freezed,
    Object? maxOutputTokens = freezed,
    Object? pricing = freezed,
    Object? capabilities = null,
  }) {
    return _then(
      _self.copyWith(
        modelId: null == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String,
        contextWindow: freezed == contextWindow
            ? _self.contextWindow
            : contextWindow // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxOutputTokens: freezed == maxOutputTokens
            ? _self.maxOutputTokens
            : maxOutputTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        pricing: freezed == pricing
            ? _self.pricing
            : pricing // ignore: cast_nullable_to_non_nullable
                  as ModelPricingDto?,
        capabilities: null == capabilities
            ? _self.capabilities
            : capabilities // ignore: cast_nullable_to_non_nullable
                  as ModelCapabilitiesDto,
      ),
    );
  }

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelPricingDtoCopyWith<$Res>? get pricing {
    if (_self.pricing == null) {
      return null;
    }

    return $ModelPricingDtoCopyWith<$Res>(_self.pricing!, (value) {
      return _then(_self.copyWith(pricing: value));
    });
  }

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities {
    return $ModelCapabilitiesDtoCopyWith<$Res>(_self.capabilities, (value) {
      return _then(_self.copyWith(capabilities: value));
    });
  }
}

/// Adds pattern-matching-related methods to [LiteLLMModelInfoDto].
extension LiteLLMModelInfoDtoPatterns on LiteLLMModelInfoDto {
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
    TResult Function(_LiteLLMModelInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto() when $default != null:
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
    TResult Function(_LiteLLMModelInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto():
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
    TResult? Function(_LiteLLMModelInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto() when $default != null:
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
      String modelId,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      ModelCapabilitiesDto capabilities,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto() when $default != null:
        return $default(
          _that.modelId,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.capabilities,
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
      String modelId,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      ModelCapabilitiesDto capabilities,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto():
        return $default(
          _that.modelId,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.capabilities,
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
      String modelId,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      ModelCapabilitiesDto capabilities,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LiteLLMModelInfoDto() when $default != null:
        return $default(
          _that.modelId,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.capabilities,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LiteLLMModelInfoDto implements LiteLLMModelInfoDto {
  const _LiteLLMModelInfoDto({
    required this.modelId,
    this.contextWindow,
    this.maxOutputTokens,
    this.pricing,
    this.capabilities = const ModelCapabilitiesDto(),
  });
  factory _LiteLLMModelInfoDto.fromJson(Map<String, dynamic> json) =>
      _$LiteLLMModelInfoDtoFromJson(json);

  @override
  final String modelId;
  @override
  final int? contextWindow;
  @override
  final int? maxOutputTokens;
  @override
  final ModelPricingDto? pricing;
  @override
  @JsonKey()
  final ModelCapabilitiesDto capabilities;

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LiteLLMModelInfoDtoCopyWith<_LiteLLMModelInfoDto> get copyWith =>
      __$LiteLLMModelInfoDtoCopyWithImpl<_LiteLLMModelInfoDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$LiteLLMModelInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LiteLLMModelInfoDto &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.contextWindow, contextWindow) ||
                other.contextWindow == contextWindow) &&
            (identical(other.maxOutputTokens, maxOutputTokens) ||
                other.maxOutputTokens == maxOutputTokens) &&
            (identical(other.pricing, pricing) || other.pricing == pricing) &&
            (identical(other.capabilities, capabilities) ||
                other.capabilities == capabilities));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    modelId,
    contextWindow,
    maxOutputTokens,
    pricing,
    capabilities,
  );

  @override
  String toString() {
    return 'LiteLLMModelInfoDto(modelId: $modelId, contextWindow: $contextWindow, maxOutputTokens: $maxOutputTokens, pricing: $pricing, capabilities: $capabilities)';
  }
}

/// @nodoc
abstract mixin class _$LiteLLMModelInfoDtoCopyWith<$Res>
    implements $LiteLLMModelInfoDtoCopyWith<$Res> {
  factory _$LiteLLMModelInfoDtoCopyWith(
    _LiteLLMModelInfoDto value,
    $Res Function(_LiteLLMModelInfoDto) _then,
  ) = __$LiteLLMModelInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String modelId,
    int? contextWindow,
    int? maxOutputTokens,
    ModelPricingDto? pricing,
    ModelCapabilitiesDto capabilities,
  });

  @override
  $ModelPricingDtoCopyWith<$Res>? get pricing;
  @override
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities;
}

/// @nodoc
class __$LiteLLMModelInfoDtoCopyWithImpl<$Res>
    implements _$LiteLLMModelInfoDtoCopyWith<$Res> {
  __$LiteLLMModelInfoDtoCopyWithImpl(this._self, this._then);

  final _LiteLLMModelInfoDto _self;
  final $Res Function(_LiteLLMModelInfoDto) _then;

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? modelId = null,
    Object? contextWindow = freezed,
    Object? maxOutputTokens = freezed,
    Object? pricing = freezed,
    Object? capabilities = null,
  }) {
    return _then(
      _LiteLLMModelInfoDto(
        modelId: null == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String,
        contextWindow: freezed == contextWindow
            ? _self.contextWindow
            : contextWindow // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxOutputTokens: freezed == maxOutputTokens
            ? _self.maxOutputTokens
            : maxOutputTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        pricing: freezed == pricing
            ? _self.pricing
            : pricing // ignore: cast_nullable_to_non_nullable
                  as ModelPricingDto?,
        capabilities: null == capabilities
            ? _self.capabilities
            : capabilities // ignore: cast_nullable_to_non_nullable
                  as ModelCapabilitiesDto,
      ),
    );
  }

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelPricingDtoCopyWith<$Res>? get pricing {
    if (_self.pricing == null) {
      return null;
    }

    return $ModelPricingDtoCopyWith<$Res>(_self.pricing!, (value) {
      return _then(_self.copyWith(pricing: value));
    });
  }

  /// Create a copy of LiteLLMModelInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities {
    return $ModelCapabilitiesDtoCopyWith<$Res>(_self.capabilities, (value) {
      return _then(_self.copyWith(capabilities: value));
    });
  }
}

/// @nodoc
mixin _$LlmModelConfigDto {
  String get id;
  String get orgId;
  String get tenantId;
  String get providerId;
  String get name;
  String get modelId;
  String get modelType;
  bool get isEnabled;
  bool get isDefault;
  ModelCapabilitiesDto get capabilities;
  int? get contextWindow;
  int? get maxOutputTokens;
  ModelPricingDto? get pricing;
  Map<String, dynamic> get parameters;
  String? get metadataSource;
  int? get embeddingDimensions;
  int? get timeoutMs;
  String get createdAt;
  String get updatedAt;
  LlmProviderEntityDto? get provider;

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LlmModelConfigDtoCopyWith<LlmModelConfigDto> get copyWith =>
      _$LlmModelConfigDtoCopyWithImpl<LlmModelConfigDto>(
        this as LlmModelConfigDto,
        _$identity,
      );

  /// Serializes this LlmModelConfigDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LlmModelConfigDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.orgId, orgId) || other.orgId == orgId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.providerId, providerId) ||
                other.providerId == providerId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.modelType, modelType) ||
                other.modelType == modelType) &&
            (identical(other.isEnabled, isEnabled) ||
                other.isEnabled == isEnabled) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.capabilities, capabilities) ||
                other.capabilities == capabilities) &&
            (identical(other.contextWindow, contextWindow) ||
                other.contextWindow == contextWindow) &&
            (identical(other.maxOutputTokens, maxOutputTokens) ||
                other.maxOutputTokens == maxOutputTokens) &&
            (identical(other.pricing, pricing) || other.pricing == pricing) &&
            const DeepCollectionEquality().equals(
              other.parameters,
              parameters,
            ) &&
            (identical(other.metadataSource, metadataSource) ||
                other.metadataSource == metadataSource) &&
            (identical(other.embeddingDimensions, embeddingDimensions) ||
                other.embeddingDimensions == embeddingDimensions) &&
            (identical(other.timeoutMs, timeoutMs) ||
                other.timeoutMs == timeoutMs) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.provider, provider) ||
                other.provider == provider));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hashAll([
    runtimeType,
    id,
    orgId,
    tenantId,
    providerId,
    name,
    modelId,
    modelType,
    isEnabled,
    isDefault,
    capabilities,
    contextWindow,
    maxOutputTokens,
    pricing,
    const DeepCollectionEquality().hash(parameters),
    metadataSource,
    embeddingDimensions,
    timeoutMs,
    createdAt,
    updatedAt,
    provider,
  ]);

  @override
  String toString() {
    return 'LlmModelConfigDto(id: $id, orgId: $orgId, tenantId: $tenantId, providerId: $providerId, name: $name, modelId: $modelId, modelType: $modelType, isEnabled: $isEnabled, isDefault: $isDefault, capabilities: $capabilities, contextWindow: $contextWindow, maxOutputTokens: $maxOutputTokens, pricing: $pricing, parameters: $parameters, metadataSource: $metadataSource, embeddingDimensions: $embeddingDimensions, timeoutMs: $timeoutMs, createdAt: $createdAt, updatedAt: $updatedAt, provider: $provider)';
  }
}

/// @nodoc
abstract mixin class $LlmModelConfigDtoCopyWith<$Res> {
  factory $LlmModelConfigDtoCopyWith(
    LlmModelConfigDto value,
    $Res Function(LlmModelConfigDto) _then,
  ) = _$LlmModelConfigDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String orgId,
    String tenantId,
    String providerId,
    String name,
    String modelId,
    String modelType,
    bool isEnabled,
    bool isDefault,
    ModelCapabilitiesDto capabilities,
    int? contextWindow,
    int? maxOutputTokens,
    ModelPricingDto? pricing,
    Map<String, dynamic> parameters,
    String? metadataSource,
    int? embeddingDimensions,
    int? timeoutMs,
    String createdAt,
    String updatedAt,
    LlmProviderEntityDto? provider,
  });

  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities;
  $ModelPricingDtoCopyWith<$Res>? get pricing;
  $LlmProviderEntityDtoCopyWith<$Res>? get provider;
}

/// @nodoc
class _$LlmModelConfigDtoCopyWithImpl<$Res>
    implements $LlmModelConfigDtoCopyWith<$Res> {
  _$LlmModelConfigDtoCopyWithImpl(this._self, this._then);

  final LlmModelConfigDto _self;
  final $Res Function(LlmModelConfigDto) _then;

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? orgId = null,
    Object? tenantId = null,
    Object? providerId = null,
    Object? name = null,
    Object? modelId = null,
    Object? modelType = null,
    Object? isEnabled = null,
    Object? isDefault = null,
    Object? capabilities = null,
    Object? contextWindow = freezed,
    Object? maxOutputTokens = freezed,
    Object? pricing = freezed,
    Object? parameters = null,
    Object? metadataSource = freezed,
    Object? embeddingDimensions = freezed,
    Object? timeoutMs = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? provider = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        orgId: null == orgId
            ? _self.orgId
            : orgId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        providerId: null == providerId
            ? _self.providerId
            : providerId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        modelId: null == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String,
        modelType: null == modelType
            ? _self.modelType
            : modelType // ignore: cast_nullable_to_non_nullable
                  as String,
        isEnabled: null == isEnabled
            ? _self.isEnabled
            : isEnabled // ignore: cast_nullable_to_non_nullable
                  as bool,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        capabilities: null == capabilities
            ? _self.capabilities
            : capabilities // ignore: cast_nullable_to_non_nullable
                  as ModelCapabilitiesDto,
        contextWindow: freezed == contextWindow
            ? _self.contextWindow
            : contextWindow // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxOutputTokens: freezed == maxOutputTokens
            ? _self.maxOutputTokens
            : maxOutputTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        pricing: freezed == pricing
            ? _self.pricing
            : pricing // ignore: cast_nullable_to_non_nullable
                  as ModelPricingDto?,
        parameters: null == parameters
            ? _self.parameters
            : parameters // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
        metadataSource: freezed == metadataSource
            ? _self.metadataSource
            : metadataSource // ignore: cast_nullable_to_non_nullable
                  as String?,
        embeddingDimensions: freezed == embeddingDimensions
            ? _self.embeddingDimensions
            : embeddingDimensions // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutMs: freezed == timeoutMs
            ? _self.timeoutMs
            : timeoutMs // ignore: cast_nullable_to_non_nullable
                  as int?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        provider: freezed == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as LlmProviderEntityDto?,
      ),
    );
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities {
    return $ModelCapabilitiesDtoCopyWith<$Res>(_self.capabilities, (value) {
      return _then(_self.copyWith(capabilities: value));
    });
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelPricingDtoCopyWith<$Res>? get pricing {
    if (_self.pricing == null) {
      return null;
    }

    return $ModelPricingDtoCopyWith<$Res>(_self.pricing!, (value) {
      return _then(_self.copyWith(pricing: value));
    });
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $LlmProviderEntityDtoCopyWith<$Res>? get provider {
    if (_self.provider == null) {
      return null;
    }

    return $LlmProviderEntityDtoCopyWith<$Res>(_self.provider!, (value) {
      return _then(_self.copyWith(provider: value));
    });
  }
}

/// Adds pattern-matching-related methods to [LlmModelConfigDto].
extension LlmModelConfigDtoPatterns on LlmModelConfigDto {
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
    TResult Function(_LlmModelConfigDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto() when $default != null:
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
    TResult Function(_LlmModelConfigDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto():
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
    TResult? Function(_LlmModelConfigDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto() when $default != null:
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
      String orgId,
      String tenantId,
      String providerId,
      String name,
      String modelId,
      String modelType,
      bool isEnabled,
      bool isDefault,
      ModelCapabilitiesDto capabilities,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      Map<String, dynamic> parameters,
      String? metadataSource,
      int? embeddingDimensions,
      int? timeoutMs,
      String createdAt,
      String updatedAt,
      LlmProviderEntityDto? provider,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto() when $default != null:
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.providerId,
          _that.name,
          _that.modelId,
          _that.modelType,
          _that.isEnabled,
          _that.isDefault,
          _that.capabilities,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.parameters,
          _that.metadataSource,
          _that.embeddingDimensions,
          _that.timeoutMs,
          _that.createdAt,
          _that.updatedAt,
          _that.provider,
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
      String orgId,
      String tenantId,
      String providerId,
      String name,
      String modelId,
      String modelType,
      bool isEnabled,
      bool isDefault,
      ModelCapabilitiesDto capabilities,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      Map<String, dynamic> parameters,
      String? metadataSource,
      int? embeddingDimensions,
      int? timeoutMs,
      String createdAt,
      String updatedAt,
      LlmProviderEntityDto? provider,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto():
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.providerId,
          _that.name,
          _that.modelId,
          _that.modelType,
          _that.isEnabled,
          _that.isDefault,
          _that.capabilities,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.parameters,
          _that.metadataSource,
          _that.embeddingDimensions,
          _that.timeoutMs,
          _that.createdAt,
          _that.updatedAt,
          _that.provider,
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
      String orgId,
      String tenantId,
      String providerId,
      String name,
      String modelId,
      String modelType,
      bool isEnabled,
      bool isDefault,
      ModelCapabilitiesDto capabilities,
      int? contextWindow,
      int? maxOutputTokens,
      ModelPricingDto? pricing,
      Map<String, dynamic> parameters,
      String? metadataSource,
      int? embeddingDimensions,
      int? timeoutMs,
      String createdAt,
      String updatedAt,
      LlmProviderEntityDto? provider,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LlmModelConfigDto() when $default != null:
        return $default(
          _that.id,
          _that.orgId,
          _that.tenantId,
          _that.providerId,
          _that.name,
          _that.modelId,
          _that.modelType,
          _that.isEnabled,
          _that.isDefault,
          _that.capabilities,
          _that.contextWindow,
          _that.maxOutputTokens,
          _that.pricing,
          _that.parameters,
          _that.metadataSource,
          _that.embeddingDimensions,
          _that.timeoutMs,
          _that.createdAt,
          _that.updatedAt,
          _that.provider,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LlmModelConfigDto implements LlmModelConfigDto {
  const _LlmModelConfigDto({
    required this.id,
    required this.orgId,
    required this.tenantId,
    required this.providerId,
    required this.name,
    required this.modelId,
    this.modelType = 'chat',
    this.isEnabled = true,
    this.isDefault = false,
    this.capabilities = const ModelCapabilitiesDto(),
    this.contextWindow,
    this.maxOutputTokens,
    this.pricing,
    final Map<String, dynamic> parameters = const <String, dynamic>{},
    this.metadataSource,
    this.embeddingDimensions,
    this.timeoutMs,
    required this.createdAt,
    required this.updatedAt,
    this.provider,
  }) : _parameters = parameters;
  factory _LlmModelConfigDto.fromJson(Map<String, dynamic> json) =>
      _$LlmModelConfigDtoFromJson(json);

  @override
  final String id;
  @override
  final String orgId;
  @override
  final String tenantId;
  @override
  final String providerId;
  @override
  final String name;
  @override
  final String modelId;
  @override
  @JsonKey()
  final String modelType;
  @override
  @JsonKey()
  final bool isEnabled;
  @override
  @JsonKey()
  final bool isDefault;
  @override
  @JsonKey()
  final ModelCapabilitiesDto capabilities;
  @override
  final int? contextWindow;
  @override
  final int? maxOutputTokens;
  @override
  final ModelPricingDto? pricing;
  final Map<String, dynamic> _parameters;
  @override
  @JsonKey()
  Map<String, dynamic> get parameters {
    if (_parameters is EqualUnmodifiableMapView) return _parameters;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_parameters);
  }

  @override
  final String? metadataSource;
  @override
  final int? embeddingDimensions;
  @override
  final int? timeoutMs;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final LlmProviderEntityDto? provider;

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LlmModelConfigDtoCopyWith<_LlmModelConfigDto> get copyWith =>
      __$LlmModelConfigDtoCopyWithImpl<_LlmModelConfigDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$LlmModelConfigDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LlmModelConfigDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.orgId, orgId) || other.orgId == orgId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.providerId, providerId) ||
                other.providerId == providerId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.modelType, modelType) ||
                other.modelType == modelType) &&
            (identical(other.isEnabled, isEnabled) ||
                other.isEnabled == isEnabled) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault) &&
            (identical(other.capabilities, capabilities) ||
                other.capabilities == capabilities) &&
            (identical(other.contextWindow, contextWindow) ||
                other.contextWindow == contextWindow) &&
            (identical(other.maxOutputTokens, maxOutputTokens) ||
                other.maxOutputTokens == maxOutputTokens) &&
            (identical(other.pricing, pricing) || other.pricing == pricing) &&
            const DeepCollectionEquality().equals(
              other._parameters,
              _parameters,
            ) &&
            (identical(other.metadataSource, metadataSource) ||
                other.metadataSource == metadataSource) &&
            (identical(other.embeddingDimensions, embeddingDimensions) ||
                other.embeddingDimensions == embeddingDimensions) &&
            (identical(other.timeoutMs, timeoutMs) ||
                other.timeoutMs == timeoutMs) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.provider, provider) ||
                other.provider == provider));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hashAll([
    runtimeType,
    id,
    orgId,
    tenantId,
    providerId,
    name,
    modelId,
    modelType,
    isEnabled,
    isDefault,
    capabilities,
    contextWindow,
    maxOutputTokens,
    pricing,
    const DeepCollectionEquality().hash(_parameters),
    metadataSource,
    embeddingDimensions,
    timeoutMs,
    createdAt,
    updatedAt,
    provider,
  ]);

  @override
  String toString() {
    return 'LlmModelConfigDto(id: $id, orgId: $orgId, tenantId: $tenantId, providerId: $providerId, name: $name, modelId: $modelId, modelType: $modelType, isEnabled: $isEnabled, isDefault: $isDefault, capabilities: $capabilities, contextWindow: $contextWindow, maxOutputTokens: $maxOutputTokens, pricing: $pricing, parameters: $parameters, metadataSource: $metadataSource, embeddingDimensions: $embeddingDimensions, timeoutMs: $timeoutMs, createdAt: $createdAt, updatedAt: $updatedAt, provider: $provider)';
  }
}

/// @nodoc
abstract mixin class _$LlmModelConfigDtoCopyWith<$Res>
    implements $LlmModelConfigDtoCopyWith<$Res> {
  factory _$LlmModelConfigDtoCopyWith(
    _LlmModelConfigDto value,
    $Res Function(_LlmModelConfigDto) _then,
  ) = __$LlmModelConfigDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String orgId,
    String tenantId,
    String providerId,
    String name,
    String modelId,
    String modelType,
    bool isEnabled,
    bool isDefault,
    ModelCapabilitiesDto capabilities,
    int? contextWindow,
    int? maxOutputTokens,
    ModelPricingDto? pricing,
    Map<String, dynamic> parameters,
    String? metadataSource,
    int? embeddingDimensions,
    int? timeoutMs,
    String createdAt,
    String updatedAt,
    LlmProviderEntityDto? provider,
  });

  @override
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities;
  @override
  $ModelPricingDtoCopyWith<$Res>? get pricing;
  @override
  $LlmProviderEntityDtoCopyWith<$Res>? get provider;
}

/// @nodoc
class __$LlmModelConfigDtoCopyWithImpl<$Res>
    implements _$LlmModelConfigDtoCopyWith<$Res> {
  __$LlmModelConfigDtoCopyWithImpl(this._self, this._then);

  final _LlmModelConfigDto _self;
  final $Res Function(_LlmModelConfigDto) _then;

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? orgId = null,
    Object? tenantId = null,
    Object? providerId = null,
    Object? name = null,
    Object? modelId = null,
    Object? modelType = null,
    Object? isEnabled = null,
    Object? isDefault = null,
    Object? capabilities = null,
    Object? contextWindow = freezed,
    Object? maxOutputTokens = freezed,
    Object? pricing = freezed,
    Object? parameters = null,
    Object? metadataSource = freezed,
    Object? embeddingDimensions = freezed,
    Object? timeoutMs = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? provider = freezed,
  }) {
    return _then(
      _LlmModelConfigDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        orgId: null == orgId
            ? _self.orgId
            : orgId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        providerId: null == providerId
            ? _self.providerId
            : providerId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        modelId: null == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String,
        modelType: null == modelType
            ? _self.modelType
            : modelType // ignore: cast_nullable_to_non_nullable
                  as String,
        isEnabled: null == isEnabled
            ? _self.isEnabled
            : isEnabled // ignore: cast_nullable_to_non_nullable
                  as bool,
        isDefault: null == isDefault
            ? _self.isDefault
            : isDefault // ignore: cast_nullable_to_non_nullable
                  as bool,
        capabilities: null == capabilities
            ? _self.capabilities
            : capabilities // ignore: cast_nullable_to_non_nullable
                  as ModelCapabilitiesDto,
        contextWindow: freezed == contextWindow
            ? _self.contextWindow
            : contextWindow // ignore: cast_nullable_to_non_nullable
                  as int?,
        maxOutputTokens: freezed == maxOutputTokens
            ? _self.maxOutputTokens
            : maxOutputTokens // ignore: cast_nullable_to_non_nullable
                  as int?,
        pricing: freezed == pricing
            ? _self.pricing
            : pricing // ignore: cast_nullable_to_non_nullable
                  as ModelPricingDto?,
        parameters: null == parameters
            ? _self._parameters
            : parameters // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
        metadataSource: freezed == metadataSource
            ? _self.metadataSource
            : metadataSource // ignore: cast_nullable_to_non_nullable
                  as String?,
        embeddingDimensions: freezed == embeddingDimensions
            ? _self.embeddingDimensions
            : embeddingDimensions // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutMs: freezed == timeoutMs
            ? _self.timeoutMs
            : timeoutMs // ignore: cast_nullable_to_non_nullable
                  as int?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        provider: freezed == provider
            ? _self.provider
            : provider // ignore: cast_nullable_to_non_nullable
                  as LlmProviderEntityDto?,
      ),
    );
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelCapabilitiesDtoCopyWith<$Res> get capabilities {
    return $ModelCapabilitiesDtoCopyWith<$Res>(_self.capabilities, (value) {
      return _then(_self.copyWith(capabilities: value));
    });
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ModelPricingDtoCopyWith<$Res>? get pricing {
    if (_self.pricing == null) {
      return null;
    }

    return $ModelPricingDtoCopyWith<$Res>(_self.pricing!, (value) {
      return _then(_self.copyWith(pricing: value));
    });
  }

  /// Create a copy of LlmModelConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $LlmProviderEntityDtoCopyWith<$Res>? get provider {
    if (_self.provider == null) {
      return null;
    }

    return $LlmProviderEntityDtoCopyWith<$Res>(_self.provider!, (value) {
      return _then(_self.copyWith(provider: value));
    });
  }
}
