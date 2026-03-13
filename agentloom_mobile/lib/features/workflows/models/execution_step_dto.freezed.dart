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
  @JsonKey(name: 'execution_id')
  String? get executionId;
  @JsonKey(name: 'node_id')
  String get nodeId;
  @JsonKey(name: 'step_order')
  int? get stepOrder;
  String get status;
  @JsonKey(name: 'node_type')
  String? get nodeType;
  @JsonKey(name: 'node_data')
  Map<String, dynamic>? get nodeData;
  Map<String, dynamic>? get result;
  @JsonKey(name: 'checkpoint_data')
  Map<String, dynamic>? get checkpointData;
  @JsonKey(name: 'error_message')
  Object? get errorMessage;
  @JsonKey(name: 'started_at')
  String? get startedAt;
  @JsonKey(name: 'completed_at')
  String? get completedAt;
  @JsonKey(name: 'created_at')
  String? get createdAt;
  @JsonKey(name: 'updated_at')
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
    @JsonKey(name: 'execution_id') String? executionId,
    @JsonKey(name: 'node_id') String nodeId,
    @JsonKey(name: 'step_order') int? stepOrder,
    String status,
    @JsonKey(name: 'node_type') String? nodeType,
    @JsonKey(name: 'node_data') Map<String, dynamic>? nodeData,
    Map<String, dynamic>? result,
    @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
    @JsonKey(name: 'error_message') Object? errorMessage,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
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
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'step_order') int? stepOrder,
      String status,
      @JsonKey(name: 'node_type') String? nodeType,
      @JsonKey(name: 'node_data') Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      @JsonKey(name: 'error_message') Object? errorMessage,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'created_at') String? createdAt,
      @JsonKey(name: 'updated_at') String? updatedAt,
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
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'step_order') int? stepOrder,
      String status,
      @JsonKey(name: 'node_type') String? nodeType,
      @JsonKey(name: 'node_data') Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      @JsonKey(name: 'error_message') Object? errorMessage,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'created_at') String? createdAt,
      @JsonKey(name: 'updated_at') String? updatedAt,
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
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'step_order') int? stepOrder,
      String status,
      @JsonKey(name: 'node_type') String? nodeType,
      @JsonKey(name: 'node_data') Map<String, dynamic>? nodeData,
      Map<String, dynamic>? result,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      @JsonKey(name: 'error_message') Object? errorMessage,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'created_at') String? createdAt,
      @JsonKey(name: 'updated_at') String? updatedAt,
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
    @JsonKey(name: 'execution_id') this.executionId,
    @JsonKey(name: 'node_id') required this.nodeId,
    @JsonKey(name: 'step_order') this.stepOrder,
    required this.status,
    @JsonKey(name: 'node_type') this.nodeType,
    @JsonKey(name: 'node_data') final Map<String, dynamic>? nodeData,
    final Map<String, dynamic>? result,
    @JsonKey(name: 'checkpoint_data')
    final Map<String, dynamic>? checkpointData,
    @JsonKey(name: 'error_message') this.errorMessage,
    @JsonKey(name: 'started_at') this.startedAt,
    @JsonKey(name: 'completed_at') this.completedAt,
    @JsonKey(name: 'created_at') this.createdAt,
    @JsonKey(name: 'updated_at') this.updatedAt,
  }) : _nodeData = nodeData,
       _result = result,
       _checkpointData = checkpointData;
  factory _ExecutionStepDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStepDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'execution_id')
  final String? executionId;
  @override
  @JsonKey(name: 'node_id')
  final String nodeId;
  @override
  @JsonKey(name: 'step_order')
  final int? stepOrder;
  @override
  final String status;
  @override
  @JsonKey(name: 'node_type')
  final String? nodeType;
  final Map<String, dynamic>? _nodeData;
  @override
  @JsonKey(name: 'node_data')
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
  @JsonKey(name: 'checkpoint_data')
  Map<String, dynamic>? get checkpointData {
    final value = _checkpointData;
    if (value == null) return null;
    if (_checkpointData is EqualUnmodifiableMapView) return _checkpointData;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey(name: 'error_message')
  final Object? errorMessage;
  @override
  @JsonKey(name: 'started_at')
  final String? startedAt;
  @override
  @JsonKey(name: 'completed_at')
  final String? completedAt;
  @override
  @JsonKey(name: 'created_at')
  final String? createdAt;
  @override
  @JsonKey(name: 'updated_at')
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
    @JsonKey(name: 'execution_id') String? executionId,
    @JsonKey(name: 'node_id') String nodeId,
    @JsonKey(name: 'step_order') int? stepOrder,
    String status,
    @JsonKey(name: 'node_type') String? nodeType,
    @JsonKey(name: 'node_data') Map<String, dynamic>? nodeData,
    Map<String, dynamic>? result,
    @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
    @JsonKey(name: 'error_message') Object? errorMessage,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
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
