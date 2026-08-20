// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'execution_step_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ExecutionStepDto {
  String get id;
  String? get executionId;
  String get nodeId;
  int? get stepOrder;
  String get status;
  String? get nodeType;
  Map<String, dynamic>? get nodeData;
  Map<String, dynamic>? get result;
  Map<String, dynamic>? get checkpointData;
  Object? get errorMessage;
  String? get startedAt;
  String? get completedAt;
  String? get createdAt;
  String? get updatedAt;

  /// Create a copy of ExecutionStepDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ExecutionStepDtoCopyWith<ExecutionStepDto> get copyWith =>
      _$ExecutionStepDtoCopyWithImpl<ExecutionStepDto>(
        this as ExecutionStepDto,
        _$identity,
      );

  /// Serializes this ExecutionStepDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ExecutionStepDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.stepOrder, stepOrder) ||
                other.stepOrder == stepOrder) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            const DeepCollectionEquality().equals(other.nodeData, nodeData) &&
            const DeepCollectionEquality().equals(other.result, result) &&
            const DeepCollectionEquality().equals(
              other.checkpointData,
              checkpointData,
            ) &&
            const DeepCollectionEquality().equals(
              other.errorMessage,
              errorMessage,
            ) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
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
    executionId,
    nodeId,
    stepOrder,
    status,
    nodeType,
    const DeepCollectionEquality().hash(nodeData),
    const DeepCollectionEquality().hash(result),
    const DeepCollectionEquality().hash(checkpointData),
    const DeepCollectionEquality().hash(errorMessage),
    startedAt,
    completedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ExecutionStepDto(id: $id, executionId: $executionId, nodeId: $nodeId, stepOrder: $stepOrder, status: $status, nodeType: $nodeType, nodeData: $nodeData, result: $result, checkpointData: $checkpointData, errorMessage: $errorMessage, startedAt: $startedAt, completedAt: $completedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $ExecutionStepDtoCopyWith<$Res> {
  factory $ExecutionStepDtoCopyWith(
    ExecutionStepDto value,
    $Res Function(ExecutionStepDto) _then,
  ) = _$ExecutionStepDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String? executionId,
    String nodeId,
    int? stepOrder,
    String status,
    String? nodeType,
    Map<String, dynamic>? nodeData,
    Map<String, dynamic>? result,
    Map<String, dynamic>? checkpointData,
    Object? errorMessage,
    String? startedAt,
    String? completedAt,
    String? createdAt,
    String? updatedAt,
  });
}

/// @nodoc
class _$ExecutionStepDtoCopyWithImpl<$Res>
    implements $ExecutionStepDtoCopyWith<$Res> {
  _$ExecutionStepDtoCopyWithImpl(this._self, this._then);

  final ExecutionStepDto _self;
  final $Res Function(ExecutionStepDto) _then;

  /// Create a copy of ExecutionStepDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? executionId = freezed,
    Object? nodeId = null,
    Object? stepOrder = freezed,
    Object? status = null,
    Object? nodeType = freezed,
    Object? nodeData = freezed,
    Object? result = freezed,
    Object? checkpointData = freezed,
    Object? errorMessage = freezed,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? createdAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        stepOrder: freezed == stepOrder
            ? _self.stepOrder
            : stepOrder // ignore: cast_nullable_to_non_nullable
                  as int?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeType: freezed == nodeType
            ? _self.nodeType
            : nodeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeData: freezed == nodeData
            ? _self.nodeData
            : nodeData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        result: freezed == result
            ? _self.result
            : result // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        checkpointData: freezed == checkpointData
            ? _self.checkpointData
            : checkpointData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: freezed == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedAt: freezed == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ExecutionStepDto].
extension ExecutionStepDtoPatterns on ExecutionStepDto {
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
    TResult Function(_ExecutionStepDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto() when $default != null:
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
    TResult Function(_ExecutionStepDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto():
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
    TResult? Function(_ExecutionStepDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto() when $default != null:
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
      String? executionId,
      String nodeId,
      int? stepOrder,
      String status,
      String? nodeType,
      Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      Map<String, dynamic>? checkpointData,
      Object? errorMessage,
      String? startedAt,
      String? completedAt,
      String? createdAt,
      String? updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto() when $default != null:
        return $default(
          _that.id,
          _that.executionId,
          _that.nodeId,
          _that.stepOrder,
          _that.status,
          _that.nodeType,
          _that.nodeData,
          _that.result,
          _that.checkpointData,
          _that.errorMessage,
          _that.startedAt,
          _that.completedAt,
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
      String? executionId,
      String nodeId,
      int? stepOrder,
      String status,
      String? nodeType,
      Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      Map<String, dynamic>? checkpointData,
      Object? errorMessage,
      String? startedAt,
      String? completedAt,
      String? createdAt,
      String? updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto():
        return $default(
          _that.id,
          _that.executionId,
          _that.nodeId,
          _that.stepOrder,
          _that.status,
          _that.nodeType,
          _that.nodeData,
          _that.result,
          _that.checkpointData,
          _that.errorMessage,
          _that.startedAt,
          _that.completedAt,
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
      String? executionId,
      String nodeId,
      int? stepOrder,
      String status,
      String? nodeType,
      Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      Map<String, dynamic>? checkpointData,
      Object? errorMessage,
      String? startedAt,
      String? completedAt,
      String? createdAt,
      String? updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStepDto() when $default != null:
        return $default(
          _that.id,
          _that.executionId,
          _that.nodeId,
          _that.stepOrder,
          _that.status,
          _that.nodeType,
          _that.nodeData,
          _that.result,
          _that.checkpointData,
          _that.errorMessage,
          _that.startedAt,
          _that.completedAt,
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
class _ExecutionStepDto implements ExecutionStepDto {
  const _ExecutionStepDto({
    required this.id,
    this.executionId,
    required this.nodeId,
    this.stepOrder,
    required this.status,
    this.nodeType,
    final Map<String, dynamic>? nodeData,
    final Map<String, dynamic>? result,
    final Map<String, dynamic>? checkpointData,
    this.errorMessage,
    this.startedAt,
    this.completedAt,
    this.createdAt,
    this.updatedAt,
  }) : _nodeData = nodeData,
       _result = result,
       _checkpointData = checkpointData;
  factory _ExecutionStepDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStepDtoFromJson(json);

  @override
  final String id;
  @override
  final String? executionId;
  @override
  final String nodeId;
  @override
  final int? stepOrder;
  @override
  final String status;
  @override
  final String? nodeType;
  final Map<String, dynamic>? _nodeData;
  @override
  Map<String, dynamic>? get nodeData {
    final value = _nodeData;
    if (value == null) return null;
    if (_nodeData is EqualUnmodifiableMapView) return _nodeData;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final Map<String, dynamic>? _result;
  @override
  Map<String, dynamic>? get result {
    final value = _result;
    if (value == null) return null;
    if (_result is EqualUnmodifiableMapView) return _result;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final Map<String, dynamic>? _checkpointData;
  @override
  Map<String, dynamic>? get checkpointData {
    final value = _checkpointData;
    if (value == null) return null;
    if (_checkpointData is EqualUnmodifiableMapView) return _checkpointData;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final Object? errorMessage;
  @override
  final String? startedAt;
  @override
  final String? completedAt;
  @override
  final String? createdAt;
  @override
  final String? updatedAt;

  /// Create a copy of ExecutionStepDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ExecutionStepDtoCopyWith<_ExecutionStepDto> get copyWith =>
      __$ExecutionStepDtoCopyWithImpl<_ExecutionStepDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ExecutionStepDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ExecutionStepDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.stepOrder, stepOrder) ||
                other.stepOrder == stepOrder) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            const DeepCollectionEquality().equals(other._nodeData, _nodeData) &&
            const DeepCollectionEquality().equals(other._result, _result) &&
            const DeepCollectionEquality().equals(
              other._checkpointData,
              _checkpointData,
            ) &&
            const DeepCollectionEquality().equals(
              other.errorMessage,
              errorMessage,
            ) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
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
    executionId,
    nodeId,
    stepOrder,
    status,
    nodeType,
    const DeepCollectionEquality().hash(_nodeData),
    const DeepCollectionEquality().hash(_result),
    const DeepCollectionEquality().hash(_checkpointData),
    const DeepCollectionEquality().hash(errorMessage),
    startedAt,
    completedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ExecutionStepDto(id: $id, executionId: $executionId, nodeId: $nodeId, stepOrder: $stepOrder, status: $status, nodeType: $nodeType, nodeData: $nodeData, result: $result, checkpointData: $checkpointData, errorMessage: $errorMessage, startedAt: $startedAt, completedAt: $completedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$ExecutionStepDtoCopyWith<$Res>
    implements $ExecutionStepDtoCopyWith<$Res> {
  factory _$ExecutionStepDtoCopyWith(
    _ExecutionStepDto value,
    $Res Function(_ExecutionStepDto) _then,
  ) = __$ExecutionStepDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String? executionId,
    String nodeId,
    int? stepOrder,
    String status,
    String? nodeType,
    Map<String, dynamic>? nodeData,
    Map<String, dynamic>? result,
    Map<String, dynamic>? checkpointData,
    Object? errorMessage,
    String? startedAt,
    String? completedAt,
    String? createdAt,
    String? updatedAt,
  });
}

/// @nodoc
class __$ExecutionStepDtoCopyWithImpl<$Res>
    implements _$ExecutionStepDtoCopyWith<$Res> {
  __$ExecutionStepDtoCopyWithImpl(this._self, this._then);

  final _ExecutionStepDto _self;
  final $Res Function(_ExecutionStepDto) _then;

  /// Create a copy of ExecutionStepDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? executionId = freezed,
    Object? nodeId = null,
    Object? stepOrder = freezed,
    Object? status = null,
    Object? nodeType = freezed,
    Object? nodeData = freezed,
    Object? result = freezed,
    Object? checkpointData = freezed,
    Object? errorMessage = freezed,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? createdAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _ExecutionStepDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        stepOrder: freezed == stepOrder
            ? _self.stepOrder
            : stepOrder // ignore: cast_nullable_to_non_nullable
                  as int?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeType: freezed == nodeType
            ? _self.nodeType
            : nodeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeData: freezed == nodeData
            ? _self._nodeData
            : nodeData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        result: freezed == result
            ? _self._result
            : result // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        checkpointData: freezed == checkpointData
            ? _self._checkpointData
            : checkpointData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: freezed == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedAt: freezed == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
