// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'conversation_message_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ConversationToolTransitionDto {
  @JsonKey(
    fromJson: _nullableToolStatusFromJson,
    toJson: _nullableToolStatusToJson,
  )
  ConversationToolStatus? get from;
  @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
  ConversationToolStatus get to;
  String get timestamp;
  String get source;

  /// Create a copy of ConversationToolTransitionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationToolTransitionDtoCopyWith<ConversationToolTransitionDto>
  get copyWith =>
      _$ConversationToolTransitionDtoCopyWithImpl<
        ConversationToolTransitionDto
      >(this as ConversationToolTransitionDto, _$identity);

  /// Serializes this ConversationToolTransitionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationToolTransitionDto &&
            (identical(other.from, from) || other.from == from) &&
            (identical(other.to, to) || other.to == to) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.source, source) || other.source == source));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, from, to, timestamp, source);

  @override
  String toString() {
    return 'ConversationToolTransitionDto(from: $from, to: $to, timestamp: $timestamp, source: $source)';
  }
}

/// @nodoc
abstract mixin class $ConversationToolTransitionDtoCopyWith<$Res> {
  factory $ConversationToolTransitionDtoCopyWith(
    ConversationToolTransitionDto value,
    $Res Function(ConversationToolTransitionDto) _then,
  ) = _$ConversationToolTransitionDtoCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? from,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    ConversationToolStatus to,
    String timestamp,
    String source,
  });
}

/// @nodoc
class _$ConversationToolTransitionDtoCopyWithImpl<$Res>
    implements $ConversationToolTransitionDtoCopyWith<$Res> {
  _$ConversationToolTransitionDtoCopyWithImpl(this._self, this._then);

  final ConversationToolTransitionDto _self;
  final $Res Function(ConversationToolTransitionDto) _then;

  /// Create a copy of ConversationToolTransitionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? from = freezed,
    Object? to = null,
    Object? timestamp = null,
    Object? source = null,
  }) {
    return _then(
      _self.copyWith(
        from: freezed == from
            ? _self.from
            : from // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus?,
        to: null == to
            ? _self.to
            : to // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus,
        timestamp: null == timestamp
            ? _self.timestamp
            : timestamp // ignore: cast_nullable_to_non_nullable
                  as String,
        source: null == source
            ? _self.source
            : source // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationToolTransitionDto].
extension ConversationToolTransitionDtoPatterns
    on ConversationToolTransitionDto {
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
    TResult Function(_ConversationToolTransitionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto() when $default != null:
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
    TResult Function(_ConversationToolTransitionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto():
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
    TResult? Function(_ConversationToolTransitionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto() when $default != null:
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
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? from,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus to,
      String timestamp,
      String source,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto() when $default != null:
        return $default(_that.from, _that.to, _that.timestamp, _that.source);
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
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? from,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus to,
      String timestamp,
      String source,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto():
        return $default(_that.from, _that.to, _that.timestamp, _that.source);
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
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? from,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus to,
      String timestamp,
      String source,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolTransitionDto() when $default != null:
        return $default(_that.from, _that.to, _that.timestamp, _that.source);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationToolTransitionDto implements ConversationToolTransitionDto {
  const _ConversationToolTransitionDto({
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    this.from,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    required this.to,
    required this.timestamp,
    required this.source,
  });
  factory _ConversationToolTransitionDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolTransitionDtoFromJson(json);

  @override
  @JsonKey(
    fromJson: _nullableToolStatusFromJson,
    toJson: _nullableToolStatusToJson,
  )
  final ConversationToolStatus? from;
  @override
  @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
  final ConversationToolStatus to;
  @override
  final String timestamp;
  @override
  final String source;

  /// Create a copy of ConversationToolTransitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationToolTransitionDtoCopyWith<_ConversationToolTransitionDto>
  get copyWith =>
      __$ConversationToolTransitionDtoCopyWithImpl<
        _ConversationToolTransitionDto
      >(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationToolTransitionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationToolTransitionDto &&
            (identical(other.from, from) || other.from == from) &&
            (identical(other.to, to) || other.to == to) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.source, source) || other.source == source));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, from, to, timestamp, source);

  @override
  String toString() {
    return 'ConversationToolTransitionDto(from: $from, to: $to, timestamp: $timestamp, source: $source)';
  }
}

/// @nodoc
abstract mixin class _$ConversationToolTransitionDtoCopyWith<$Res>
    implements $ConversationToolTransitionDtoCopyWith<$Res> {
  factory _$ConversationToolTransitionDtoCopyWith(
    _ConversationToolTransitionDto value,
    $Res Function(_ConversationToolTransitionDto) _then,
  ) = __$ConversationToolTransitionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? from,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    ConversationToolStatus to,
    String timestamp,
    String source,
  });
}

/// @nodoc
class __$ConversationToolTransitionDtoCopyWithImpl<$Res>
    implements _$ConversationToolTransitionDtoCopyWith<$Res> {
  __$ConversationToolTransitionDtoCopyWithImpl(this._self, this._then);

  final _ConversationToolTransitionDto _self;
  final $Res Function(_ConversationToolTransitionDto) _then;

  /// Create a copy of ConversationToolTransitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? from = freezed,
    Object? to = null,
    Object? timestamp = null,
    Object? source = null,
  }) {
    return _then(
      _ConversationToolTransitionDto(
        from: freezed == from
            ? _self.from
            : from // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus?,
        to: null == to
            ? _self.to
            : to // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus,
        timestamp: null == timestamp
            ? _self.timestamp
            : timestamp // ignore: cast_nullable_to_non_nullable
                  as String,
        source: null == source
            ? _self.source
            : source // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
mixin _$ConversationToolPermissionRequestDto {
  String? get description;
  @JsonKey(fromJson: _stringListFromJson)
  List<String> get resourcePaths;
  String? get domain;
  String? get category;
  String? get riskLevel;
  String? get sourceLabel;
  String? get targetType;
  String? get targetLabel;
  String? get approveEffect;
  String? get denyEffect;
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get diffPreview;
  bool? get rememberable;

  /// Create a copy of ConversationToolPermissionRequestDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationToolPermissionRequestDtoCopyWith<
    ConversationToolPermissionRequestDto
  >
  get copyWith =>
      _$ConversationToolPermissionRequestDtoCopyWithImpl<
        ConversationToolPermissionRequestDto
      >(this as ConversationToolPermissionRequestDto, _$identity);

  /// Serializes this ConversationToolPermissionRequestDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationToolPermissionRequestDto &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other.resourcePaths,
              resourcePaths,
            ) &&
            (identical(other.domain, domain) || other.domain == domain) &&
            (identical(other.category, category) ||
                other.category == category) &&
            (identical(other.riskLevel, riskLevel) ||
                other.riskLevel == riskLevel) &&
            (identical(other.sourceLabel, sourceLabel) ||
                other.sourceLabel == sourceLabel) &&
            (identical(other.targetType, targetType) ||
                other.targetType == targetType) &&
            (identical(other.targetLabel, targetLabel) ||
                other.targetLabel == targetLabel) &&
            (identical(other.approveEffect, approveEffect) ||
                other.approveEffect == approveEffect) &&
            (identical(other.denyEffect, denyEffect) ||
                other.denyEffect == denyEffect) &&
            const DeepCollectionEquality().equals(
              other.diffPreview,
              diffPreview,
            ) &&
            (identical(other.rememberable, rememberable) ||
                other.rememberable == rememberable));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    description,
    const DeepCollectionEquality().hash(resourcePaths),
    domain,
    category,
    riskLevel,
    sourceLabel,
    targetType,
    targetLabel,
    approveEffect,
    denyEffect,
    const DeepCollectionEquality().hash(diffPreview),
    rememberable,
  );

  @override
  String toString() {
    return 'ConversationToolPermissionRequestDto(description: $description, resourcePaths: $resourcePaths, domain: $domain, category: $category, riskLevel: $riskLevel, sourceLabel: $sourceLabel, targetType: $targetType, targetLabel: $targetLabel, approveEffect: $approveEffect, denyEffect: $denyEffect, diffPreview: $diffPreview, rememberable: $rememberable)';
  }
}

/// @nodoc
abstract mixin class $ConversationToolPermissionRequestDtoCopyWith<$Res> {
  factory $ConversationToolPermissionRequestDtoCopyWith(
    ConversationToolPermissionRequestDto value,
    $Res Function(ConversationToolPermissionRequestDto) _then,
  ) = _$ConversationToolPermissionRequestDtoCopyWithImpl;
  @useResult
  $Res call({
    String? description,
    @JsonKey(fromJson: _stringListFromJson) List<String> resourcePaths,
    String? domain,
    String? category,
    String? riskLevel,
    String? sourceLabel,
    String? targetType,
    String? targetLabel,
    String? approveEffect,
    String? denyEffect,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? diffPreview,
    bool? rememberable,
  });
}

/// @nodoc
class _$ConversationToolPermissionRequestDtoCopyWithImpl<$Res>
    implements $ConversationToolPermissionRequestDtoCopyWith<$Res> {
  _$ConversationToolPermissionRequestDtoCopyWithImpl(this._self, this._then);

  final ConversationToolPermissionRequestDto _self;
  final $Res Function(ConversationToolPermissionRequestDto) _then;

  /// Create a copy of ConversationToolPermissionRequestDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? description = freezed,
    Object? resourcePaths = null,
    Object? domain = freezed,
    Object? category = freezed,
    Object? riskLevel = freezed,
    Object? sourceLabel = freezed,
    Object? targetType = freezed,
    Object? targetLabel = freezed,
    Object? approveEffect = freezed,
    Object? denyEffect = freezed,
    Object? diffPreview = freezed,
    Object? rememberable = freezed,
  }) {
    return _then(
      _self.copyWith(
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        resourcePaths: null == resourcePaths
            ? _self.resourcePaths
            : resourcePaths // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        domain: freezed == domain
            ? _self.domain
            : domain // ignore: cast_nullable_to_non_nullable
                  as String?,
        category: freezed == category
            ? _self.category
            : category // ignore: cast_nullable_to_non_nullable
                  as String?,
        riskLevel: freezed == riskLevel
            ? _self.riskLevel
            : riskLevel // ignore: cast_nullable_to_non_nullable
                  as String?,
        sourceLabel: freezed == sourceLabel
            ? _self.sourceLabel
            : sourceLabel // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetType: freezed == targetType
            ? _self.targetType
            : targetType // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetLabel: freezed == targetLabel
            ? _self.targetLabel
            : targetLabel // ignore: cast_nullable_to_non_nullable
                  as String?,
        approveEffect: freezed == approveEffect
            ? _self.approveEffect
            : approveEffect // ignore: cast_nullable_to_non_nullable
                  as String?,
        denyEffect: freezed == denyEffect
            ? _self.denyEffect
            : denyEffect // ignore: cast_nullable_to_non_nullable
                  as String?,
        diffPreview: freezed == diffPreview
            ? _self.diffPreview
            : diffPreview // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        rememberable: freezed == rememberable
            ? _self.rememberable
            : rememberable // ignore: cast_nullable_to_non_nullable
                  as bool?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationToolPermissionRequestDto].
extension ConversationToolPermissionRequestDtoPatterns
    on ConversationToolPermissionRequestDto {
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
    TResult Function(_ConversationToolPermissionRequestDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto() when $default != null:
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
    TResult Function(_ConversationToolPermissionRequestDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto():
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
    TResult? Function(_ConversationToolPermissionRequestDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto() when $default != null:
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
      String? description,
      @JsonKey(fromJson: _stringListFromJson) List<String> resourcePaths,
      String? domain,
      String? category,
      String? riskLevel,
      String? sourceLabel,
      String? targetType,
      String? targetLabel,
      String? approveEffect,
      String? denyEffect,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? diffPreview,
      bool? rememberable,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto() when $default != null:
        return $default(
          _that.description,
          _that.resourcePaths,
          _that.domain,
          _that.category,
          _that.riskLevel,
          _that.sourceLabel,
          _that.targetType,
          _that.targetLabel,
          _that.approveEffect,
          _that.denyEffect,
          _that.diffPreview,
          _that.rememberable,
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
      String? description,
      @JsonKey(fromJson: _stringListFromJson) List<String> resourcePaths,
      String? domain,
      String? category,
      String? riskLevel,
      String? sourceLabel,
      String? targetType,
      String? targetLabel,
      String? approveEffect,
      String? denyEffect,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? diffPreview,
      bool? rememberable,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto():
        return $default(
          _that.description,
          _that.resourcePaths,
          _that.domain,
          _that.category,
          _that.riskLevel,
          _that.sourceLabel,
          _that.targetType,
          _that.targetLabel,
          _that.approveEffect,
          _that.denyEffect,
          _that.diffPreview,
          _that.rememberable,
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
      String? description,
      @JsonKey(fromJson: _stringListFromJson) List<String> resourcePaths,
      String? domain,
      String? category,
      String? riskLevel,
      String? sourceLabel,
      String? targetType,
      String? targetLabel,
      String? approveEffect,
      String? denyEffect,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? diffPreview,
      bool? rememberable,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolPermissionRequestDto() when $default != null:
        return $default(
          _that.description,
          _that.resourcePaths,
          _that.domain,
          _that.category,
          _that.riskLevel,
          _that.sourceLabel,
          _that.targetType,
          _that.targetLabel,
          _that.approveEffect,
          _that.denyEffect,
          _that.diffPreview,
          _that.rememberable,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationToolPermissionRequestDto
    implements ConversationToolPermissionRequestDto {
  const _ConversationToolPermissionRequestDto({
    this.description,
    @JsonKey(fromJson: _stringListFromJson)
    final List<String> resourcePaths = const <String>[],
    this.domain,
    this.category,
    this.riskLevel,
    this.sourceLabel,
    this.targetType,
    this.targetLabel,
    this.approveEffect,
    this.denyEffect,
    @JsonKey(fromJson: _nullableMapFromJson)
    final Map<String, dynamic>? diffPreview,
    this.rememberable,
  }) : _resourcePaths = resourcePaths,
       _diffPreview = diffPreview;
  factory _ConversationToolPermissionRequestDto.fromJson(
    Map<String, dynamic> json,
  ) => _$ConversationToolPermissionRequestDtoFromJson(json);

  @override
  final String? description;
  final List<String> _resourcePaths;
  @override
  @JsonKey(fromJson: _stringListFromJson)
  List<String> get resourcePaths {
    if (_resourcePaths is EqualUnmodifiableListView) return _resourcePaths;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_resourcePaths);
  }

  @override
  final String? domain;
  @override
  final String? category;
  @override
  final String? riskLevel;
  @override
  final String? sourceLabel;
  @override
  final String? targetType;
  @override
  final String? targetLabel;
  @override
  final String? approveEffect;
  @override
  final String? denyEffect;
  final Map<String, dynamic>? _diffPreview;
  @override
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get diffPreview {
    final value = _diffPreview;
    if (value == null) return null;
    if (_diffPreview is EqualUnmodifiableMapView) return _diffPreview;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final bool? rememberable;

  /// Create a copy of ConversationToolPermissionRequestDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationToolPermissionRequestDtoCopyWith<
    _ConversationToolPermissionRequestDto
  >
  get copyWith =>
      __$ConversationToolPermissionRequestDtoCopyWithImpl<
        _ConversationToolPermissionRequestDto
      >(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationToolPermissionRequestDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationToolPermissionRequestDto &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other._resourcePaths,
              _resourcePaths,
            ) &&
            (identical(other.domain, domain) || other.domain == domain) &&
            (identical(other.category, category) ||
                other.category == category) &&
            (identical(other.riskLevel, riskLevel) ||
                other.riskLevel == riskLevel) &&
            (identical(other.sourceLabel, sourceLabel) ||
                other.sourceLabel == sourceLabel) &&
            (identical(other.targetType, targetType) ||
                other.targetType == targetType) &&
            (identical(other.targetLabel, targetLabel) ||
                other.targetLabel == targetLabel) &&
            (identical(other.approveEffect, approveEffect) ||
                other.approveEffect == approveEffect) &&
            (identical(other.denyEffect, denyEffect) ||
                other.denyEffect == denyEffect) &&
            const DeepCollectionEquality().equals(
              other._diffPreview,
              _diffPreview,
            ) &&
            (identical(other.rememberable, rememberable) ||
                other.rememberable == rememberable));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    description,
    const DeepCollectionEquality().hash(_resourcePaths),
    domain,
    category,
    riskLevel,
    sourceLabel,
    targetType,
    targetLabel,
    approveEffect,
    denyEffect,
    const DeepCollectionEquality().hash(_diffPreview),
    rememberable,
  );

  @override
  String toString() {
    return 'ConversationToolPermissionRequestDto(description: $description, resourcePaths: $resourcePaths, domain: $domain, category: $category, riskLevel: $riskLevel, sourceLabel: $sourceLabel, targetType: $targetType, targetLabel: $targetLabel, approveEffect: $approveEffect, denyEffect: $denyEffect, diffPreview: $diffPreview, rememberable: $rememberable)';
  }
}

/// @nodoc
abstract mixin class _$ConversationToolPermissionRequestDtoCopyWith<$Res>
    implements $ConversationToolPermissionRequestDtoCopyWith<$Res> {
  factory _$ConversationToolPermissionRequestDtoCopyWith(
    _ConversationToolPermissionRequestDto value,
    $Res Function(_ConversationToolPermissionRequestDto) _then,
  ) = __$ConversationToolPermissionRequestDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String? description,
    @JsonKey(fromJson: _stringListFromJson) List<String> resourcePaths,
    String? domain,
    String? category,
    String? riskLevel,
    String? sourceLabel,
    String? targetType,
    String? targetLabel,
    String? approveEffect,
    String? denyEffect,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? diffPreview,
    bool? rememberable,
  });
}

/// @nodoc
class __$ConversationToolPermissionRequestDtoCopyWithImpl<$Res>
    implements _$ConversationToolPermissionRequestDtoCopyWith<$Res> {
  __$ConversationToolPermissionRequestDtoCopyWithImpl(this._self, this._then);

  final _ConversationToolPermissionRequestDto _self;
  final $Res Function(_ConversationToolPermissionRequestDto) _then;

  /// Create a copy of ConversationToolPermissionRequestDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? description = freezed,
    Object? resourcePaths = null,
    Object? domain = freezed,
    Object? category = freezed,
    Object? riskLevel = freezed,
    Object? sourceLabel = freezed,
    Object? targetType = freezed,
    Object? targetLabel = freezed,
    Object? approveEffect = freezed,
    Object? denyEffect = freezed,
    Object? diffPreview = freezed,
    Object? rememberable = freezed,
  }) {
    return _then(
      _ConversationToolPermissionRequestDto(
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        resourcePaths: null == resourcePaths
            ? _self._resourcePaths
            : resourcePaths // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        domain: freezed == domain
            ? _self.domain
            : domain // ignore: cast_nullable_to_non_nullable
                  as String?,
        category: freezed == category
            ? _self.category
            : category // ignore: cast_nullable_to_non_nullable
                  as String?,
        riskLevel: freezed == riskLevel
            ? _self.riskLevel
            : riskLevel // ignore: cast_nullable_to_non_nullable
                  as String?,
        sourceLabel: freezed == sourceLabel
            ? _self.sourceLabel
            : sourceLabel // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetType: freezed == targetType
            ? _self.targetType
            : targetType // ignore: cast_nullable_to_non_nullable
                  as String?,
        targetLabel: freezed == targetLabel
            ? _self.targetLabel
            : targetLabel // ignore: cast_nullable_to_non_nullable
                  as String?,
        approveEffect: freezed == approveEffect
            ? _self.approveEffect
            : approveEffect // ignore: cast_nullable_to_non_nullable
                  as String?,
        denyEffect: freezed == denyEffect
            ? _self.denyEffect
            : denyEffect // ignore: cast_nullable_to_non_nullable
                  as String?,
        diffPreview: freezed == diffPreview
            ? _self._diffPreview
            : diffPreview // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        rememberable: freezed == rememberable
            ? _self.rememberable
            : rememberable // ignore: cast_nullable_to_non_nullable
                  as bool?,
      ),
    );
  }
}

/// @nodoc
mixin _$ConversationToolCallDto {
  String get id;
  String get tool;
  Object? get args;
  @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
  ConversationToolStatus get status;
  Object? get result;
  String? get error;
  @JsonKey(fromJson: _transitionsFromJson)
  List<ConversationToolTransitionDto> get transitions;
  @JsonKey(fromJson: _permissionRequestFromJson)
  ConversationToolPermissionRequestDto? get permissionRequest;
  @JsonKey(includeFromJson: false, includeToJson: false)
  DateTime? get startedAt;
  @JsonKey(includeFromJson: false, includeToJson: false)
  DateTime? get updatedAt;

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationToolCallDtoCopyWith<ConversationToolCallDto> get copyWith =>
      _$ConversationToolCallDtoCopyWithImpl<ConversationToolCallDto>(
        this as ConversationToolCallDto,
        _$identity,
      );

  /// Serializes this ConversationToolCallDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationToolCallDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tool, tool) || other.tool == tool) &&
            const DeepCollectionEquality().equals(other.args, args) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other.result, result) &&
            (identical(other.error, error) || other.error == error) &&
            const DeepCollectionEquality().equals(
              other.transitions,
              transitions,
            ) &&
            (identical(other.permissionRequest, permissionRequest) ||
                other.permissionRequest == permissionRequest) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tool,
    const DeepCollectionEquality().hash(args),
    status,
    const DeepCollectionEquality().hash(result),
    error,
    const DeepCollectionEquality().hash(transitions),
    permissionRequest,
    startedAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ConversationToolCallDto(id: $id, tool: $tool, args: $args, status: $status, result: $result, error: $error, transitions: $transitions, permissionRequest: $permissionRequest, startedAt: $startedAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $ConversationToolCallDtoCopyWith<$Res> {
  factory $ConversationToolCallDtoCopyWith(
    ConversationToolCallDto value,
    $Res Function(ConversationToolCallDto) _then,
  ) = _$ConversationToolCallDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String tool,
    Object? args,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    ConversationToolStatus status,
    Object? result,
    String? error,
    @JsonKey(fromJson: _transitionsFromJson)
    List<ConversationToolTransitionDto> transitions,
    @JsonKey(fromJson: _permissionRequestFromJson)
    ConversationToolPermissionRequestDto? permissionRequest,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? startedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? updatedAt,
  });

  $ConversationToolPermissionRequestDtoCopyWith<$Res>? get permissionRequest;
}

/// @nodoc
class _$ConversationToolCallDtoCopyWithImpl<$Res>
    implements $ConversationToolCallDtoCopyWith<$Res> {
  _$ConversationToolCallDtoCopyWithImpl(this._self, this._then);

  final ConversationToolCallDto _self;
  final $Res Function(ConversationToolCallDto) _then;

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tool = null,
    Object? args = freezed,
    Object? status = null,
    Object? result = freezed,
    Object? error = freezed,
    Object? transitions = null,
    Object? permissionRequest = freezed,
    Object? startedAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tool: null == tool
            ? _self.tool
            : tool // ignore: cast_nullable_to_non_nullable
                  as String,
        args: freezed == args ? _self.args : args,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus,
        result: freezed == result ? _self.result : result,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
        transitions: null == transitions
            ? _self.transitions
            : transitions // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolTransitionDto>,
        permissionRequest: freezed == permissionRequest
            ? _self.permissionRequest
            : permissionRequest // ignore: cast_nullable_to_non_nullable
                  as ConversationToolPermissionRequestDto?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
        updatedAt: freezed == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
      ),
    );
  }

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ConversationToolPermissionRequestDtoCopyWith<$Res>? get permissionRequest {
    if (_self.permissionRequest == null) {
      return null;
    }

    return $ConversationToolPermissionRequestDtoCopyWith<$Res>(
      _self.permissionRequest!,
      (value) {
        return _then(_self.copyWith(permissionRequest: value));
      },
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationToolCallDto].
extension ConversationToolCallDtoPatterns on ConversationToolCallDto {
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
    TResult Function(_ConversationToolCallDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto() when $default != null:
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
    TResult Function(_ConversationToolCallDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto():
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
    TResult? Function(_ConversationToolCallDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto() when $default != null:
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
      String tool,
      Object? args,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus status,
      Object? result,
      String? error,
      @JsonKey(fromJson: _transitionsFromJson)
      List<ConversationToolTransitionDto> transitions,
      @JsonKey(fromJson: _permissionRequestFromJson)
      ConversationToolPermissionRequestDto? permissionRequest,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? startedAt,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto() when $default != null:
        return $default(
          _that.id,
          _that.tool,
          _that.args,
          _that.status,
          _that.result,
          _that.error,
          _that.transitions,
          _that.permissionRequest,
          _that.startedAt,
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
      String tool,
      Object? args,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus status,
      Object? result,
      String? error,
      @JsonKey(fromJson: _transitionsFromJson)
      List<ConversationToolTransitionDto> transitions,
      @JsonKey(fromJson: _permissionRequestFromJson)
      ConversationToolPermissionRequestDto? permissionRequest,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? startedAt,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto():
        return $default(
          _that.id,
          _that.tool,
          _that.args,
          _that.status,
          _that.result,
          _that.error,
          _that.transitions,
          _that.permissionRequest,
          _that.startedAt,
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
      String tool,
      Object? args,
      @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
      ConversationToolStatus status,
      Object? result,
      String? error,
      @JsonKey(fromJson: _transitionsFromJson)
      List<ConversationToolTransitionDto> transitions,
      @JsonKey(fromJson: _permissionRequestFromJson)
      ConversationToolPermissionRequestDto? permissionRequest,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? startedAt,
      @JsonKey(includeFromJson: false, includeToJson: false)
      DateTime? updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolCallDto() when $default != null:
        return $default(
          _that.id,
          _that.tool,
          _that.args,
          _that.status,
          _that.result,
          _that.error,
          _that.transitions,
          _that.permissionRequest,
          _that.startedAt,
          _that.updatedAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationToolCallDto implements ConversationToolCallDto {
  const _ConversationToolCallDto({
    required this.id,
    required this.tool,
    this.args,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    required this.status,
    this.result,
    this.error,
    @JsonKey(fromJson: _transitionsFromJson)
    final List<ConversationToolTransitionDto> transitions =
        const <ConversationToolTransitionDto>[],
    @JsonKey(fromJson: _permissionRequestFromJson) this.permissionRequest,
    @JsonKey(includeFromJson: false, includeToJson: false) this.startedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) this.updatedAt,
  }) : _transitions = transitions;
  factory _ConversationToolCallDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolCallDtoFromJson(json);

  @override
  final String id;
  @override
  final String tool;
  @override
  final Object? args;
  @override
  @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
  final ConversationToolStatus status;
  @override
  final Object? result;
  @override
  final String? error;
  final List<ConversationToolTransitionDto> _transitions;
  @override
  @JsonKey(fromJson: _transitionsFromJson)
  List<ConversationToolTransitionDto> get transitions {
    if (_transitions is EqualUnmodifiableListView) return _transitions;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_transitions);
  }

  @override
  @JsonKey(fromJson: _permissionRequestFromJson)
  final ConversationToolPermissionRequestDto? permissionRequest;
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  final DateTime? startedAt;
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  final DateTime? updatedAt;

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationToolCallDtoCopyWith<_ConversationToolCallDto> get copyWith =>
      __$ConversationToolCallDtoCopyWithImpl<_ConversationToolCallDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationToolCallDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationToolCallDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tool, tool) || other.tool == tool) &&
            const DeepCollectionEquality().equals(other.args, args) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other.result, result) &&
            (identical(other.error, error) || other.error == error) &&
            const DeepCollectionEquality().equals(
              other._transitions,
              _transitions,
            ) &&
            (identical(other.permissionRequest, permissionRequest) ||
                other.permissionRequest == permissionRequest) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tool,
    const DeepCollectionEquality().hash(args),
    status,
    const DeepCollectionEquality().hash(result),
    error,
    const DeepCollectionEquality().hash(_transitions),
    permissionRequest,
    startedAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ConversationToolCallDto(id: $id, tool: $tool, args: $args, status: $status, result: $result, error: $error, transitions: $transitions, permissionRequest: $permissionRequest, startedAt: $startedAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$ConversationToolCallDtoCopyWith<$Res>
    implements $ConversationToolCallDtoCopyWith<$Res> {
  factory _$ConversationToolCallDtoCopyWith(
    _ConversationToolCallDto value,
    $Res Function(_ConversationToolCallDto) _then,
  ) = __$ConversationToolCallDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String tool,
    Object? args,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    ConversationToolStatus status,
    Object? result,
    String? error,
    @JsonKey(fromJson: _transitionsFromJson)
    List<ConversationToolTransitionDto> transitions,
    @JsonKey(fromJson: _permissionRequestFromJson)
    ConversationToolPermissionRequestDto? permissionRequest,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? startedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? updatedAt,
  });

  @override
  $ConversationToolPermissionRequestDtoCopyWith<$Res>? get permissionRequest;
}

/// @nodoc
class __$ConversationToolCallDtoCopyWithImpl<$Res>
    implements _$ConversationToolCallDtoCopyWith<$Res> {
  __$ConversationToolCallDtoCopyWithImpl(this._self, this._then);

  final _ConversationToolCallDto _self;
  final $Res Function(_ConversationToolCallDto) _then;

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tool = null,
    Object? args = freezed,
    Object? status = null,
    Object? result = freezed,
    Object? error = freezed,
    Object? transitions = null,
    Object? permissionRequest = freezed,
    Object? startedAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _ConversationToolCallDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tool: null == tool
            ? _self.tool
            : tool // ignore: cast_nullable_to_non_nullable
                  as String,
        args: freezed == args ? _self.args : args,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus,
        result: freezed == result ? _self.result : result,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
        transitions: null == transitions
            ? _self._transitions
            : transitions // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolTransitionDto>,
        permissionRequest: freezed == permissionRequest
            ? _self.permissionRequest
            : permissionRequest // ignore: cast_nullable_to_non_nullable
                  as ConversationToolPermissionRequestDto?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
        updatedAt: freezed == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as DateTime?,
      ),
    );
  }

  /// Create a copy of ConversationToolCallDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ConversationToolPermissionRequestDtoCopyWith<$Res>? get permissionRequest {
    if (_self.permissionRequest == null) {
      return null;
    }

    return $ConversationToolPermissionRequestDtoCopyWith<$Res>(
      _self.permissionRequest!,
      (value) {
        return _then(_self.copyWith(permissionRequest: value));
      },
    );
  }
}

/// @nodoc
mixin _$ConversationToolResultDto {
  String? get toolCallId;
  String? get tool;
  @JsonKey(
    fromJson: _nullableToolStatusFromJson,
    toJson: _nullableToolStatusToJson,
  )
  ConversationToolStatus? get status;
  Object? get result;
  String? get error;

  /// Create a copy of ConversationToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationToolResultDtoCopyWith<ConversationToolResultDto> get copyWith =>
      _$ConversationToolResultDtoCopyWithImpl<ConversationToolResultDto>(
        this as ConversationToolResultDto,
        _$identity,
      );

  /// Serializes this ConversationToolResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationToolResultDto &&
            (identical(other.toolCallId, toolCallId) ||
                other.toolCallId == toolCallId) &&
            (identical(other.tool, tool) || other.tool == tool) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other.result, result) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolCallId,
    tool,
    status,
    const DeepCollectionEquality().hash(result),
    error,
  );

  @override
  String toString() {
    return 'ConversationToolResultDto(toolCallId: $toolCallId, tool: $tool, status: $status, result: $result, error: $error)';
  }
}

/// @nodoc
abstract mixin class $ConversationToolResultDtoCopyWith<$Res> {
  factory $ConversationToolResultDtoCopyWith(
    ConversationToolResultDto value,
    $Res Function(ConversationToolResultDto) _then,
  ) = _$ConversationToolResultDtoCopyWithImpl;
  @useResult
  $Res call({
    String? toolCallId,
    String? tool,
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? status,
    Object? result,
    String? error,
  });
}

/// @nodoc
class _$ConversationToolResultDtoCopyWithImpl<$Res>
    implements $ConversationToolResultDtoCopyWith<$Res> {
  _$ConversationToolResultDtoCopyWithImpl(this._self, this._then);

  final ConversationToolResultDto _self;
  final $Res Function(ConversationToolResultDto) _then;

  /// Create a copy of ConversationToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? toolCallId = freezed,
    Object? tool = freezed,
    Object? status = freezed,
    Object? result = freezed,
    Object? error = freezed,
  }) {
    return _then(
      _self.copyWith(
        toolCallId: freezed == toolCallId
            ? _self.toolCallId
            : toolCallId // ignore: cast_nullable_to_non_nullable
                  as String?,
        tool: freezed == tool
            ? _self.tool
            : tool // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus?,
        result: freezed == result ? _self.result : result,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationToolResultDto].
extension ConversationToolResultDtoPatterns on ConversationToolResultDto {
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
    TResult Function(_ConversationToolResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto() when $default != null:
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
    TResult Function(_ConversationToolResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto():
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
    TResult? Function(_ConversationToolResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto() when $default != null:
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
      String? toolCallId,
      String? tool,
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? status,
      Object? result,
      String? error,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto() when $default != null:
        return $default(
          _that.toolCallId,
          _that.tool,
          _that.status,
          _that.result,
          _that.error,
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
      String? toolCallId,
      String? tool,
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? status,
      Object? result,
      String? error,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto():
        return $default(
          _that.toolCallId,
          _that.tool,
          _that.status,
          _that.result,
          _that.error,
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
      String? toolCallId,
      String? tool,
      @JsonKey(
        fromJson: _nullableToolStatusFromJson,
        toJson: _nullableToolStatusToJson,
      )
      ConversationToolStatus? status,
      Object? result,
      String? error,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationToolResultDto() when $default != null:
        return $default(
          _that.toolCallId,
          _that.tool,
          _that.status,
          _that.result,
          _that.error,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationToolResultDto implements ConversationToolResultDto {
  const _ConversationToolResultDto({
    this.toolCallId,
    this.tool,
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    this.status,
    this.result,
    this.error,
  });
  factory _ConversationToolResultDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolResultDtoFromJson(json);

  @override
  final String? toolCallId;
  @override
  final String? tool;
  @override
  @JsonKey(
    fromJson: _nullableToolStatusFromJson,
    toJson: _nullableToolStatusToJson,
  )
  final ConversationToolStatus? status;
  @override
  final Object? result;
  @override
  final String? error;

  /// Create a copy of ConversationToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationToolResultDtoCopyWith<_ConversationToolResultDto>
  get copyWith =>
      __$ConversationToolResultDtoCopyWithImpl<_ConversationToolResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationToolResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationToolResultDto &&
            (identical(other.toolCallId, toolCallId) ||
                other.toolCallId == toolCallId) &&
            (identical(other.tool, tool) || other.tool == tool) &&
            (identical(other.status, status) || other.status == status) &&
            const DeepCollectionEquality().equals(other.result, result) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolCallId,
    tool,
    status,
    const DeepCollectionEquality().hash(result),
    error,
  );

  @override
  String toString() {
    return 'ConversationToolResultDto(toolCallId: $toolCallId, tool: $tool, status: $status, result: $result, error: $error)';
  }
}

/// @nodoc
abstract mixin class _$ConversationToolResultDtoCopyWith<$Res>
    implements $ConversationToolResultDtoCopyWith<$Res> {
  factory _$ConversationToolResultDtoCopyWith(
    _ConversationToolResultDto value,
    $Res Function(_ConversationToolResultDto) _then,
  ) = __$ConversationToolResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String? toolCallId,
    String? tool,
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? status,
    Object? result,
    String? error,
  });
}

/// @nodoc
class __$ConversationToolResultDtoCopyWithImpl<$Res>
    implements _$ConversationToolResultDtoCopyWith<$Res> {
  __$ConversationToolResultDtoCopyWithImpl(this._self, this._then);

  final _ConversationToolResultDto _self;
  final $Res Function(_ConversationToolResultDto) _then;

  /// Create a copy of ConversationToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? toolCallId = freezed,
    Object? tool = freezed,
    Object? status = freezed,
    Object? result = freezed,
    Object? error = freezed,
  }) {
    return _then(
      _ConversationToolResultDto(
        toolCallId: freezed == toolCallId
            ? _self.toolCallId
            : toolCallId // ignore: cast_nullable_to_non_nullable
                  as String?,
        tool: freezed == tool
            ? _self.tool
            : tool // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as ConversationToolStatus?,
        result: freezed == result ? _self.result : result,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$ConversationMessageDto {
  String get id;
  String get conversationId;
  @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
  MessageRole get role;
  String get content;
  @JsonKey(fromJson: _toolCallsFromJson)
  List<ConversationToolCallDto> get toolCalls;
  @JsonKey(fromJson: _toolResultsFromJson)
  List<ConversationToolResultDto> get toolResults;
  @JsonKey(fromJson: _mapFromJson)
  Map<String, dynamic> get metadata;
  String get createdAt;
  @JsonKey(includeFromJson: false, includeToJson: false)
  String? get thinking;
  @JsonKey(includeFromJson: false, includeToJson: false)
  List<MessageSegment> get segments;
  @JsonKey(includeFromJson: false, includeToJson: false)
  bool get isStreaming;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationMessageDtoCopyWith<ConversationMessageDto> get copyWith =>
      _$ConversationMessageDtoCopyWithImpl<ConversationMessageDto>(
        this as ConversationMessageDto,
        _$identity,
      );

  /// Serializes this ConversationMessageDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationMessageDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.conversationId, conversationId) ||
                other.conversationId == conversationId) &&
            (identical(other.role, role) || other.role == role) &&
            (identical(other.content, content) || other.content == content) &&
            const DeepCollectionEquality().equals(other.toolCalls, toolCalls) &&
            const DeepCollectionEquality().equals(
              other.toolResults,
              toolResults,
            ) &&
            const DeepCollectionEquality().equals(other.metadata, metadata) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.thinking, thinking) ||
                other.thinking == thinking) &&
            const DeepCollectionEquality().equals(other.segments, segments) &&
            (identical(other.isStreaming, isStreaming) ||
                other.isStreaming == isStreaming));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    conversationId,
    role,
    content,
    const DeepCollectionEquality().hash(toolCalls),
    const DeepCollectionEquality().hash(toolResults),
    const DeepCollectionEquality().hash(metadata),
    createdAt,
    thinking,
    const DeepCollectionEquality().hash(segments),
    isStreaming,
  );

  @override
  String toString() {
    return 'ConversationMessageDto(id: $id, conversationId: $conversationId, role: $role, content: $content, toolCalls: $toolCalls, toolResults: $toolResults, metadata: $metadata, createdAt: $createdAt, thinking: $thinking, segments: $segments, isStreaming: $isStreaming)';
  }
}

/// @nodoc
abstract mixin class $ConversationMessageDtoCopyWith<$Res> {
  factory $ConversationMessageDtoCopyWith(
    ConversationMessageDto value,
    $Res Function(ConversationMessageDto) _then,
  ) = _$ConversationMessageDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String conversationId,
    @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
    MessageRole role,
    String content,
    @JsonKey(fromJson: _toolCallsFromJson)
    List<ConversationToolCallDto> toolCalls,
    @JsonKey(fromJson: _toolResultsFromJson)
    List<ConversationToolResultDto> toolResults,
    @JsonKey(fromJson: _mapFromJson) Map<String, dynamic> metadata,
    String createdAt,
    @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
    @JsonKey(includeFromJson: false, includeToJson: false)
    List<MessageSegment> segments,
    @JsonKey(includeFromJson: false, includeToJson: false) bool isStreaming,
  });
}

/// @nodoc
class _$ConversationMessageDtoCopyWithImpl<$Res>
    implements $ConversationMessageDtoCopyWith<$Res> {
  _$ConversationMessageDtoCopyWithImpl(this._self, this._then);

  final ConversationMessageDto _self;
  final $Res Function(ConversationMessageDto) _then;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? conversationId = null,
    Object? role = null,
    Object? content = null,
    Object? toolCalls = null,
    Object? toolResults = null,
    Object? metadata = null,
    Object? createdAt = null,
    Object? thinking = freezed,
    Object? segments = null,
    Object? isStreaming = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        conversationId: null == conversationId
            ? _self.conversationId
            : conversationId // ignore: cast_nullable_to_non_nullable
                  as String,
        role: null == role
            ? _self.role
            : role // ignore: cast_nullable_to_non_nullable
                  as MessageRole,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        toolCalls: null == toolCalls
            ? _self.toolCalls
            : toolCalls // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolCallDto>,
        toolResults: null == toolResults
            ? _self.toolResults
            : toolResults // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolResultDto>,
        metadata: null == metadata
            ? _self.metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        thinking: freezed == thinking
            ? _self.thinking
            : thinking // ignore: cast_nullable_to_non_nullable
                  as String?,
        segments: null == segments
            ? _self.segments
            : segments // ignore: cast_nullable_to_non_nullable
                  as List<MessageSegment>,
        isStreaming: null == isStreaming
            ? _self.isStreaming
            : isStreaming // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationMessageDto].
extension ConversationMessageDtoPatterns on ConversationMessageDto {
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
    TResult Function(_ConversationMessageDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
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
    TResult Function(_ConversationMessageDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto():
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
    TResult? Function(_ConversationMessageDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
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
      String conversationId,
      @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
      MessageRole role,
      String content,
      @JsonKey(fromJson: _toolCallsFromJson)
      List<ConversationToolCallDto> toolCalls,
      @JsonKey(fromJson: _toolResultsFromJson)
      List<ConversationToolResultDto> toolResults,
      @JsonKey(fromJson: _mapFromJson) Map<String, dynamic> metadata,
      String createdAt,
      @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
      @JsonKey(includeFromJson: false, includeToJson: false)
      List<MessageSegment> segments,
      @JsonKey(includeFromJson: false, includeToJson: false) bool isStreaming,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.content,
          _that.toolCalls,
          _that.toolResults,
          _that.metadata,
          _that.createdAt,
          _that.thinking,
          _that.segments,
          _that.isStreaming,
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
      String conversationId,
      @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
      MessageRole role,
      String content,
      @JsonKey(fromJson: _toolCallsFromJson)
      List<ConversationToolCallDto> toolCalls,
      @JsonKey(fromJson: _toolResultsFromJson)
      List<ConversationToolResultDto> toolResults,
      @JsonKey(fromJson: _mapFromJson) Map<String, dynamic> metadata,
      String createdAt,
      @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
      @JsonKey(includeFromJson: false, includeToJson: false)
      List<MessageSegment> segments,
      @JsonKey(includeFromJson: false, includeToJson: false) bool isStreaming,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto():
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.content,
          _that.toolCalls,
          _that.toolResults,
          _that.metadata,
          _that.createdAt,
          _that.thinking,
          _that.segments,
          _that.isStreaming,
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
      String conversationId,
      @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
      MessageRole role,
      String content,
      @JsonKey(fromJson: _toolCallsFromJson)
      List<ConversationToolCallDto> toolCalls,
      @JsonKey(fromJson: _toolResultsFromJson)
      List<ConversationToolResultDto> toolResults,
      @JsonKey(fromJson: _mapFromJson) Map<String, dynamic> metadata,
      String createdAt,
      @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
      @JsonKey(includeFromJson: false, includeToJson: false)
      List<MessageSegment> segments,
      @JsonKey(includeFromJson: false, includeToJson: false) bool isStreaming,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.content,
          _that.toolCalls,
          _that.toolResults,
          _that.metadata,
          _that.createdAt,
          _that.thinking,
          _that.segments,
          _that.isStreaming,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationMessageDto implements ConversationMessageDto {
  const _ConversationMessageDto({
    required this.id,
    required this.conversationId,
    @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
    required this.role,
    required this.content,
    @JsonKey(fromJson: _toolCallsFromJson)
    final List<ConversationToolCallDto> toolCalls =
        const <ConversationToolCallDto>[],
    @JsonKey(fromJson: _toolResultsFromJson)
    final List<ConversationToolResultDto> toolResults =
        const <ConversationToolResultDto>[],
    @JsonKey(fromJson: _mapFromJson)
    final Map<String, dynamic> metadata = const <String, dynamic>{},
    required this.createdAt,
    @JsonKey(includeFromJson: false, includeToJson: false) this.thinking,
    @JsonKey(includeFromJson: false, includeToJson: false)
    final List<MessageSegment> segments = const <MessageSegment>[],
    @JsonKey(includeFromJson: false, includeToJson: false)
    this.isStreaming = false,
  }) : _toolCalls = toolCalls,
       _toolResults = toolResults,
       _metadata = metadata,
       _segments = segments;
  factory _ConversationMessageDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationMessageDtoFromJson(json);

  @override
  final String id;
  @override
  final String conversationId;
  @override
  @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
  final MessageRole role;
  @override
  final String content;
  final List<ConversationToolCallDto> _toolCalls;
  @override
  @JsonKey(fromJson: _toolCallsFromJson)
  List<ConversationToolCallDto> get toolCalls {
    if (_toolCalls is EqualUnmodifiableListView) return _toolCalls;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_toolCalls);
  }

  final List<ConversationToolResultDto> _toolResults;
  @override
  @JsonKey(fromJson: _toolResultsFromJson)
  List<ConversationToolResultDto> get toolResults {
    if (_toolResults is EqualUnmodifiableListView) return _toolResults;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_toolResults);
  }

  final Map<String, dynamic> _metadata;
  @override
  @JsonKey(fromJson: _mapFromJson)
  Map<String, dynamic> get metadata {
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_metadata);
  }

  @override
  final String createdAt;
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? thinking;
  final List<MessageSegment> _segments;
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  List<MessageSegment> get segments {
    if (_segments is EqualUnmodifiableListView) return _segments;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_segments);
  }

  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  final bool isStreaming;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationMessageDtoCopyWith<_ConversationMessageDto> get copyWith =>
      __$ConversationMessageDtoCopyWithImpl<_ConversationMessageDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationMessageDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationMessageDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.conversationId, conversationId) ||
                other.conversationId == conversationId) &&
            (identical(other.role, role) || other.role == role) &&
            (identical(other.content, content) || other.content == content) &&
            const DeepCollectionEquality().equals(
              other._toolCalls,
              _toolCalls,
            ) &&
            const DeepCollectionEquality().equals(
              other._toolResults,
              _toolResults,
            ) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.thinking, thinking) ||
                other.thinking == thinking) &&
            const DeepCollectionEquality().equals(other._segments, _segments) &&
            (identical(other.isStreaming, isStreaming) ||
                other.isStreaming == isStreaming));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    conversationId,
    role,
    content,
    const DeepCollectionEquality().hash(_toolCalls),
    const DeepCollectionEquality().hash(_toolResults),
    const DeepCollectionEquality().hash(_metadata),
    createdAt,
    thinking,
    const DeepCollectionEquality().hash(_segments),
    isStreaming,
  );

  @override
  String toString() {
    return 'ConversationMessageDto(id: $id, conversationId: $conversationId, role: $role, content: $content, toolCalls: $toolCalls, toolResults: $toolResults, metadata: $metadata, createdAt: $createdAt, thinking: $thinking, segments: $segments, isStreaming: $isStreaming)';
  }
}

/// @nodoc
abstract mixin class _$ConversationMessageDtoCopyWith<$Res>
    implements $ConversationMessageDtoCopyWith<$Res> {
  factory _$ConversationMessageDtoCopyWith(
    _ConversationMessageDto value,
    $Res Function(_ConversationMessageDto) _then,
  ) = __$ConversationMessageDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String conversationId,
    @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
    MessageRole role,
    String content,
    @JsonKey(fromJson: _toolCallsFromJson)
    List<ConversationToolCallDto> toolCalls,
    @JsonKey(fromJson: _toolResultsFromJson)
    List<ConversationToolResultDto> toolResults,
    @JsonKey(fromJson: _mapFromJson) Map<String, dynamic> metadata,
    String createdAt,
    @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
    @JsonKey(includeFromJson: false, includeToJson: false)
    List<MessageSegment> segments,
    @JsonKey(includeFromJson: false, includeToJson: false) bool isStreaming,
  });
}

/// @nodoc
class __$ConversationMessageDtoCopyWithImpl<$Res>
    implements _$ConversationMessageDtoCopyWith<$Res> {
  __$ConversationMessageDtoCopyWithImpl(this._self, this._then);

  final _ConversationMessageDto _self;
  final $Res Function(_ConversationMessageDto) _then;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? conversationId = null,
    Object? role = null,
    Object? content = null,
    Object? toolCalls = null,
    Object? toolResults = null,
    Object? metadata = null,
    Object? createdAt = null,
    Object? thinking = freezed,
    Object? segments = null,
    Object? isStreaming = null,
  }) {
    return _then(
      _ConversationMessageDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        conversationId: null == conversationId
            ? _self.conversationId
            : conversationId // ignore: cast_nullable_to_non_nullable
                  as String,
        role: null == role
            ? _self.role
            : role // ignore: cast_nullable_to_non_nullable
                  as MessageRole,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        toolCalls: null == toolCalls
            ? _self._toolCalls
            : toolCalls // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolCallDto>,
        toolResults: null == toolResults
            ? _self._toolResults
            : toolResults // ignore: cast_nullable_to_non_nullable
                  as List<ConversationToolResultDto>,
        metadata: null == metadata
            ? _self._metadata
            : metadata // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        thinking: freezed == thinking
            ? _self.thinking
            : thinking // ignore: cast_nullable_to_non_nullable
                  as String?,
        segments: null == segments
            ? _self._segments
            : segments // ignore: cast_nullable_to_non_nullable
                  as List<MessageSegment>,
        isStreaming: null == isStreaming
            ? _self.isStreaming
            : isStreaming // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}
