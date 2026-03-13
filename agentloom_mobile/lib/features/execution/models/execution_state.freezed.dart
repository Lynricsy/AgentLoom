// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'execution_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$StepSnapshot {
  @JsonKey(name: 'step_id')
  String get stepId;
  @JsonKey(name: 'node_id')
  String get nodeId;
  @JsonKey(name: 'node_name')
  String? get nodeName;
  @JsonKey(name: 'node_type')
  String? get nodeType;
  String get status;
  @JsonKey(name: 'started_at')
  String? get startedAt;
  @JsonKey(name: 'completed_at')
  String? get completedAt;
  @JsonKey(name: 'error_message')
  String? get errorMessage;
  @JsonKey(name: 'error_detail')
  Map<String, dynamic>? get errorDetail;
  @JsonKey(name: 'checkpoint_data')
  Map<String, dynamic>? get checkpointData;
  Map<String, dynamic>? get result;

  /// Create a copy of StepSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $StepSnapshotCopyWith<StepSnapshot> get copyWith =>
      _$StepSnapshotCopyWithImpl<StepSnapshot>(
        this as StepSnapshot,
        _$identity,
      );

  /// Serializes this StepSnapshot to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is StepSnapshot &&
            (identical(other.stepId, stepId) || other.stepId == stepId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.nodeName, nodeName) ||
                other.nodeName == nodeName) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            const DeepCollectionEquality().equals(
              other.errorDetail,
              errorDetail,
            ) &&
            const DeepCollectionEquality().equals(
              other.checkpointData,
              checkpointData,
            ) &&
            const DeepCollectionEquality().equals(other.result, result));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    stepId,
    nodeId,
    nodeName,
    nodeType,
    status,
    startedAt,
    completedAt,
    errorMessage,
    const DeepCollectionEquality().hash(errorDetail),
    const DeepCollectionEquality().hash(checkpointData),
    const DeepCollectionEquality().hash(result),
  );

  @override
  String toString() {
    return 'StepSnapshot(stepId: $stepId, nodeId: $nodeId, nodeName: $nodeName, nodeType: $nodeType, status: $status, startedAt: $startedAt, completedAt: $completedAt, errorMessage: $errorMessage, errorDetail: $errorDetail, checkpointData: $checkpointData, result: $result)';
  }
}

/// @nodoc
abstract mixin class $StepSnapshotCopyWith<$Res> {
  factory $StepSnapshotCopyWith(
    StepSnapshot value,
    $Res Function(StepSnapshot) _then,
  ) = _$StepSnapshotCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(name: 'step_id') String stepId,
    @JsonKey(name: 'node_id') String nodeId,
    @JsonKey(name: 'node_name') String? nodeName,
    @JsonKey(name: 'node_type') String? nodeType,
    String status,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'error_message') String? errorMessage,
    @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
    @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
    Map<String, dynamic>? result,
  });
}

/// @nodoc
class _$StepSnapshotCopyWithImpl<$Res> implements $StepSnapshotCopyWith<$Res> {
  _$StepSnapshotCopyWithImpl(this._self, this._then);

  final StepSnapshot _self;
  final $Res Function(StepSnapshot) _then;

  /// Create a copy of StepSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? stepId = null,
    Object? nodeId = null,
    Object? nodeName = freezed,
    Object? nodeType = freezed,
    Object? status = null,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? errorMessage = freezed,
    Object? errorDetail = freezed,
    Object? checkpointData = freezed,
    Object? result = freezed,
  }) {
    return _then(
      _self.copyWith(
        stepId: null == stepId
            ? _self.stepId
            : stepId // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeName: freezed == nodeName
            ? _self.nodeName
            : nodeName // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeType: freezed == nodeType
            ? _self.nodeType
            : nodeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorDetail: freezed == errorDetail
            ? _self.errorDetail
            : errorDetail // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        checkpointData: freezed == checkpointData
            ? _self.checkpointData
            : checkpointData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        result: freezed == result
            ? _self.result
            : result // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [StepSnapshot].
extension StepSnapshotPatterns on StepSnapshot {
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
    TResult Function(_StepSnapshot value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot() when $default != null:
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
    TResult Function(_StepSnapshot value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot():
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
    TResult? Function(_StepSnapshot value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot() when $default != null:
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
      @JsonKey(name: 'step_id') String stepId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'node_name') String? nodeName,
      @JsonKey(name: 'node_type') String? nodeType,
      String status,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'error_message') String? errorMessage,
      @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      Map<String, dynamic>? result,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot() when $default != null:
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.status,
          _that.startedAt,
          _that.completedAt,
          _that.errorMessage,
          _that.errorDetail,
          _that.checkpointData,
          _that.result,
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
      @JsonKey(name: 'step_id') String stepId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'node_name') String? nodeName,
      @JsonKey(name: 'node_type') String? nodeType,
      String status,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'error_message') String? errorMessage,
      @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      Map<String, dynamic>? result,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot():
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.status,
          _that.startedAt,
          _that.completedAt,
          _that.errorMessage,
          _that.errorDetail,
          _that.checkpointData,
          _that.result,
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
      @JsonKey(name: 'step_id') String stepId,
      @JsonKey(name: 'node_id') String nodeId,
      @JsonKey(name: 'node_name') String? nodeName,
      @JsonKey(name: 'node_type') String? nodeType,
      String status,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'error_message') String? errorMessage,
      @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
      @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
      Map<String, dynamic>? result,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _StepSnapshot() when $default != null:
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.status,
          _that.startedAt,
          _that.completedAt,
          _that.errorMessage,
          _that.errorDetail,
          _that.checkpointData,
          _that.result,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _StepSnapshot implements StepSnapshot {
  const _StepSnapshot({
    @JsonKey(name: 'step_id') required this.stepId,
    @JsonKey(name: 'node_id') required this.nodeId,
    @JsonKey(name: 'node_name') this.nodeName,
    @JsonKey(name: 'node_type') this.nodeType,
    required this.status,
    @JsonKey(name: 'started_at') this.startedAt,
    @JsonKey(name: 'completed_at') this.completedAt,
    @JsonKey(name: 'error_message') this.errorMessage,
    @JsonKey(name: 'error_detail') final Map<String, dynamic>? errorDetail,
    @JsonKey(name: 'checkpoint_data')
    final Map<String, dynamic>? checkpointData,
    final Map<String, dynamic>? result,
  }) : _errorDetail = errorDetail,
       _checkpointData = checkpointData,
       _result = result;
  factory _StepSnapshot.fromJson(Map<String, dynamic> json) =>
      _$StepSnapshotFromJson(json);

  @override
  @JsonKey(name: 'step_id')
  final String stepId;
  @override
  @JsonKey(name: 'node_id')
  final String nodeId;
  @override
  @JsonKey(name: 'node_name')
  final String? nodeName;
  @override
  @JsonKey(name: 'node_type')
  final String? nodeType;
  @override
  final String status;
  @override
  @JsonKey(name: 'started_at')
  final String? startedAt;
  @override
  @JsonKey(name: 'completed_at')
  final String? completedAt;
  @override
  @JsonKey(name: 'error_message')
  final String? errorMessage;
  final Map<String, dynamic>? _errorDetail;
  @override
  @JsonKey(name: 'error_detail')
  Map<String, dynamic>? get errorDetail {
    final value = _errorDetail;
    if (value == null) return null;
    if (_errorDetail is EqualUnmodifiableMapView) return _errorDetail;
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

  final Map<String, dynamic>? _result;
  @override
  Map<String, dynamic>? get result {
    final value = _result;
    if (value == null) return null;
    if (_result is EqualUnmodifiableMapView) return _result;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  /// Create a copy of StepSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$StepSnapshotCopyWith<_StepSnapshot> get copyWith =>
      __$StepSnapshotCopyWithImpl<_StepSnapshot>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$StepSnapshotToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _StepSnapshot &&
            (identical(other.stepId, stepId) || other.stepId == stepId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.nodeName, nodeName) ||
                other.nodeName == nodeName) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            const DeepCollectionEquality().equals(
              other._errorDetail,
              _errorDetail,
            ) &&
            const DeepCollectionEquality().equals(
              other._checkpointData,
              _checkpointData,
            ) &&
            const DeepCollectionEquality().equals(other._result, _result));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    stepId,
    nodeId,
    nodeName,
    nodeType,
    status,
    startedAt,
    completedAt,
    errorMessage,
    const DeepCollectionEquality().hash(_errorDetail),
    const DeepCollectionEquality().hash(_checkpointData),
    const DeepCollectionEquality().hash(_result),
  );

  @override
  String toString() {
    return 'StepSnapshot(stepId: $stepId, nodeId: $nodeId, nodeName: $nodeName, nodeType: $nodeType, status: $status, startedAt: $startedAt, completedAt: $completedAt, errorMessage: $errorMessage, errorDetail: $errorDetail, checkpointData: $checkpointData, result: $result)';
  }
}

/// @nodoc
abstract mixin class _$StepSnapshotCopyWith<$Res>
    implements $StepSnapshotCopyWith<$Res> {
  factory _$StepSnapshotCopyWith(
    _StepSnapshot value,
    $Res Function(_StepSnapshot) _then,
  ) = __$StepSnapshotCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'step_id') String stepId,
    @JsonKey(name: 'node_id') String nodeId,
    @JsonKey(name: 'node_name') String? nodeName,
    @JsonKey(name: 'node_type') String? nodeType,
    String status,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'error_message') String? errorMessage,
    @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
    @JsonKey(name: 'checkpoint_data') Map<String, dynamic>? checkpointData,
    Map<String, dynamic>? result,
  });
}

/// @nodoc
class __$StepSnapshotCopyWithImpl<$Res>
    implements _$StepSnapshotCopyWith<$Res> {
  __$StepSnapshotCopyWithImpl(this._self, this._then);

  final _StepSnapshot _self;
  final $Res Function(_StepSnapshot) _then;

  /// Create a copy of StepSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? stepId = null,
    Object? nodeId = null,
    Object? nodeName = freezed,
    Object? nodeType = freezed,
    Object? status = null,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? errorMessage = freezed,
    Object? errorDetail = freezed,
    Object? checkpointData = freezed,
    Object? result = freezed,
  }) {
    return _then(
      _StepSnapshot(
        stepId: null == stepId
            ? _self.stepId
            : stepId // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeId: null == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String,
        nodeName: freezed == nodeName
            ? _self.nodeName
            : nodeName // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeType: freezed == nodeType
            ? _self.nodeType
            : nodeType // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorDetail: freezed == errorDetail
            ? _self._errorDetail
            : errorDetail // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        checkpointData: freezed == checkpointData
            ? _self._checkpointData
            : checkpointData // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        result: freezed == result
            ? _self._result
            : result // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
      ),
    );
  }
}

/// @nodoc
mixin _$ExecutionStateSnapshot {
  @JsonKey(name: 'execution_id')
  String get executionId;
  String get status;
  @JsonKey(name: 'completed_steps')
  int? get completedSteps;
  @JsonKey(name: 'total_steps')
  int? get totalSteps;
  List<StepSnapshot> get steps;
  @JsonKey(name: 'snapshot_at')
  String? get snapshotAt;
  @JsonKey(name: 'last_event_id')
  int? get lastEventId;

  /// Create a copy of ExecutionStateSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ExecutionStateSnapshotCopyWith<ExecutionStateSnapshot> get copyWith =>
      _$ExecutionStateSnapshotCopyWithImpl<ExecutionStateSnapshot>(
        this as ExecutionStateSnapshot,
        _$identity,
      );

  /// Serializes this ExecutionStateSnapshot to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ExecutionStateSnapshot &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            const DeepCollectionEquality().equals(other.steps, steps) &&
            (identical(other.snapshotAt, snapshotAt) ||
                other.snapshotAt == snapshotAt) &&
            (identical(other.lastEventId, lastEventId) ||
                other.lastEventId == lastEventId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    executionId,
    status,
    completedSteps,
    totalSteps,
    const DeepCollectionEquality().hash(steps),
    snapshotAt,
    lastEventId,
  );

  @override
  String toString() {
    return 'ExecutionStateSnapshot(executionId: $executionId, status: $status, completedSteps: $completedSteps, totalSteps: $totalSteps, steps: $steps, snapshotAt: $snapshotAt, lastEventId: $lastEventId)';
  }
}

/// @nodoc
abstract mixin class $ExecutionStateSnapshotCopyWith<$Res> {
  factory $ExecutionStateSnapshotCopyWith(
    ExecutionStateSnapshot value,
    $Res Function(ExecutionStateSnapshot) _then,
  ) = _$ExecutionStateSnapshotCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(name: 'execution_id') String executionId,
    String status,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'total_steps') int? totalSteps,
    List<StepSnapshot> steps,
    @JsonKey(name: 'snapshot_at') String? snapshotAt,
    @JsonKey(name: 'last_event_id') int? lastEventId,
  });
}

/// @nodoc
class _$ExecutionStateSnapshotCopyWithImpl<$Res>
    implements $ExecutionStateSnapshotCopyWith<$Res> {
  _$ExecutionStateSnapshotCopyWithImpl(this._self, this._then);

  final ExecutionStateSnapshot _self;
  final $Res Function(ExecutionStateSnapshot) _then;

  /// Create a copy of ExecutionStateSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? executionId = null,
    Object? status = null,
    Object? completedSteps = freezed,
    Object? totalSteps = freezed,
    Object? steps = null,
    Object? snapshotAt = freezed,
    Object? lastEventId = freezed,
  }) {
    return _then(
      _self.copyWith(
        executionId: null == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        completedSteps: freezed == completedSteps
            ? _self.completedSteps
            : completedSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        totalSteps: freezed == totalSteps
            ? _self.totalSteps
            : totalSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        steps: null == steps
            ? _self.steps
            : steps // ignore: cast_nullable_to_non_nullable
                  as List<StepSnapshot>,
        snapshotAt: freezed == snapshotAt
            ? _self.snapshotAt
            : snapshotAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        lastEventId: freezed == lastEventId
            ? _self.lastEventId
            : lastEventId // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ExecutionStateSnapshot].
extension ExecutionStateSnapshotPatterns on ExecutionStateSnapshot {
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
    TResult Function(_ExecutionStateSnapshot value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot() when $default != null:
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
    TResult Function(_ExecutionStateSnapshot value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot():
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
    TResult? Function(_ExecutionStateSnapshot value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot() when $default != null:
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
      @JsonKey(name: 'execution_id') String executionId,
      String status,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'total_steps') int? totalSteps,
      List<StepSnapshot> steps,
      @JsonKey(name: 'snapshot_at') String? snapshotAt,
      @JsonKey(name: 'last_event_id') int? lastEventId,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot() when $default != null:
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.steps,
          _that.snapshotAt,
          _that.lastEventId,
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
      @JsonKey(name: 'execution_id') String executionId,
      String status,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'total_steps') int? totalSteps,
      List<StepSnapshot> steps,
      @JsonKey(name: 'snapshot_at') String? snapshotAt,
      @JsonKey(name: 'last_event_id') int? lastEventId,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot():
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.steps,
          _that.snapshotAt,
          _that.lastEventId,
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
      @JsonKey(name: 'execution_id') String executionId,
      String status,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'total_steps') int? totalSteps,
      List<StepSnapshot> steps,
      @JsonKey(name: 'snapshot_at') String? snapshotAt,
      @JsonKey(name: 'last_event_id') int? lastEventId,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStateSnapshot() when $default != null:
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.steps,
          _that.snapshotAt,
          _that.lastEventId,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ExecutionStateSnapshot implements ExecutionStateSnapshot {
  const _ExecutionStateSnapshot({
    @JsonKey(name: 'execution_id') required this.executionId,
    required this.status,
    @JsonKey(name: 'completed_steps') this.completedSteps,
    @JsonKey(name: 'total_steps') this.totalSteps,
    required final List<StepSnapshot> steps,
    @JsonKey(name: 'snapshot_at') this.snapshotAt,
    @JsonKey(name: 'last_event_id') this.lastEventId,
  }) : _steps = steps;
  factory _ExecutionStateSnapshot.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStateSnapshotFromJson(json);

  @override
  @JsonKey(name: 'execution_id')
  final String executionId;
  @override
  final String status;
  @override
  @JsonKey(name: 'completed_steps')
  final int? completedSteps;
  @override
  @JsonKey(name: 'total_steps')
  final int? totalSteps;
  final List<StepSnapshot> _steps;
  @override
  List<StepSnapshot> get steps {
    if (_steps is EqualUnmodifiableListView) return _steps;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_steps);
  }

  @override
  @JsonKey(name: 'snapshot_at')
  final String? snapshotAt;
  @override
  @JsonKey(name: 'last_event_id')
  final int? lastEventId;

  /// Create a copy of ExecutionStateSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ExecutionStateSnapshotCopyWith<_ExecutionStateSnapshot> get copyWith =>
      __$ExecutionStateSnapshotCopyWithImpl<_ExecutionStateSnapshot>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ExecutionStateSnapshotToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ExecutionStateSnapshot &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            const DeepCollectionEquality().equals(other._steps, _steps) &&
            (identical(other.snapshotAt, snapshotAt) ||
                other.snapshotAt == snapshotAt) &&
            (identical(other.lastEventId, lastEventId) ||
                other.lastEventId == lastEventId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    executionId,
    status,
    completedSteps,
    totalSteps,
    const DeepCollectionEquality().hash(_steps),
    snapshotAt,
    lastEventId,
  );

  @override
  String toString() {
    return 'ExecutionStateSnapshot(executionId: $executionId, status: $status, completedSteps: $completedSteps, totalSteps: $totalSteps, steps: $steps, snapshotAt: $snapshotAt, lastEventId: $lastEventId)';
  }
}

/// @nodoc
abstract mixin class _$ExecutionStateSnapshotCopyWith<$Res>
    implements $ExecutionStateSnapshotCopyWith<$Res> {
  factory _$ExecutionStateSnapshotCopyWith(
    _ExecutionStateSnapshot value,
    $Res Function(_ExecutionStateSnapshot) _then,
  ) = __$ExecutionStateSnapshotCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'execution_id') String executionId,
    String status,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'total_steps') int? totalSteps,
    List<StepSnapshot> steps,
    @JsonKey(name: 'snapshot_at') String? snapshotAt,
    @JsonKey(name: 'last_event_id') int? lastEventId,
  });
}

/// @nodoc
class __$ExecutionStateSnapshotCopyWithImpl<$Res>
    implements _$ExecutionStateSnapshotCopyWith<$Res> {
  __$ExecutionStateSnapshotCopyWithImpl(this._self, this._then);

  final _ExecutionStateSnapshot _self;
  final $Res Function(_ExecutionStateSnapshot) _then;

  /// Create a copy of ExecutionStateSnapshot
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? executionId = null,
    Object? status = null,
    Object? completedSteps = freezed,
    Object? totalSteps = freezed,
    Object? steps = null,
    Object? snapshotAt = freezed,
    Object? lastEventId = freezed,
  }) {
    return _then(
      _ExecutionStateSnapshot(
        executionId: null == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        completedSteps: freezed == completedSteps
            ? _self.completedSteps
            : completedSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        totalSteps: freezed == totalSteps
            ? _self.totalSteps
            : totalSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        steps: null == steps
            ? _self._steps
            : steps // ignore: cast_nullable_to_non_nullable
                  as List<StepSnapshot>,
        snapshotAt: freezed == snapshotAt
            ? _self.snapshotAt
            : snapshotAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        lastEventId: freezed == lastEventId
            ? _self.lastEventId
            : lastEventId // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}
