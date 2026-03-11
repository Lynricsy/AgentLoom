// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'execution_summary_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ExecutionSummaryDto {
  String get id;
  @JsonKey(name: 'workflow_id')
  String get workflowId;
  String get status;
  @JsonKey(name: 'trigger_type')
  String? get triggerType;
  @JsonKey(name: 'total_steps')
  int? get totalSteps;
  @JsonKey(name: 'completed_steps')
  int? get completedSteps;
  @JsonKey(name: 'started_at')
  String? get startedAt;
  @JsonKey(name: 'completed_at')
  String? get completedAt;
  @JsonKey(name: 'failed_at')
  String? get failedAt;
  @JsonKey(name: 'created_at')
  String get createdAt;
  @JsonKey(name: 'updated_at')
  String get updatedAt;

  /// Create a copy of ExecutionSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ExecutionSummaryDtoCopyWith<ExecutionSummaryDto> get copyWith =>
      _$ExecutionSummaryDtoCopyWithImpl<ExecutionSummaryDto>(
        this as ExecutionSummaryDto,
        _$identity,
      );

  /// Serializes this ExecutionSummaryDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ExecutionSummaryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.workflowId, workflowId) ||
                other.workflowId == workflowId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.triggerType, triggerType) ||
                other.triggerType == triggerType) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.failedAt, failedAt) ||
                other.failedAt == failedAt) &&
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
    workflowId,
    status,
    triggerType,
    totalSteps,
    completedSteps,
    startedAt,
    completedAt,
    failedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ExecutionSummaryDto(id: $id, workflowId: $workflowId, status: $status, triggerType: $triggerType, totalSteps: $totalSteps, completedSteps: $completedSteps, startedAt: $startedAt, completedAt: $completedAt, failedAt: $failedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $ExecutionSummaryDtoCopyWith<$Res> {
  factory $ExecutionSummaryDtoCopyWith(
    ExecutionSummaryDto value,
    $Res Function(ExecutionSummaryDto) _then,
  ) = _$ExecutionSummaryDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'workflow_id') String workflowId,
    String status,
    @JsonKey(name: 'trigger_type') String? triggerType,
    @JsonKey(name: 'total_steps') int? totalSteps,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'failed_at') String? failedAt,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class _$ExecutionSummaryDtoCopyWithImpl<$Res>
    implements $ExecutionSummaryDtoCopyWith<$Res> {
  _$ExecutionSummaryDtoCopyWithImpl(this._self, this._then);

  final ExecutionSummaryDto _self;
  final $Res Function(ExecutionSummaryDto) _then;

  /// Create a copy of ExecutionSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? workflowId = null,
    Object? status = null,
    Object? triggerType = freezed,
    Object? totalSteps = freezed,
    Object? completedSteps = freezed,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? failedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        workflowId: null == workflowId
            ? _self.workflowId
            : workflowId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        triggerType: freezed == triggerType
            ? _self.triggerType
            : triggerType // ignore: cast_nullable_to_non_nullable
                  as String?,
        totalSteps: freezed == totalSteps
            ? _self.totalSteps
            : totalSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        completedSteps: freezed == completedSteps
            ? _self.completedSteps
            : completedSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        failedAt: freezed == failedAt
            ? _self.failedAt
            : failedAt // ignore: cast_nullable_to_non_nullable
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

/// Adds pattern-matching-related methods to [ExecutionSummaryDto].
extension ExecutionSummaryDtoPatterns on ExecutionSummaryDto {
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
    TResult Function(_ExecutionSummaryDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto() when $default != null:
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
    TResult Function(_ExecutionSummaryDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto():
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
    TResult? Function(_ExecutionSummaryDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto() when $default != null:
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
      @JsonKey(name: 'workflow_id') String workflowId,
      String status,
      @JsonKey(name: 'trigger_type') String? triggerType,
      @JsonKey(name: 'total_steps') int? totalSteps,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'failed_at') String? failedAt,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto() when $default != null:
        return $default(
          _that.id,
          _that.workflowId,
          _that.status,
          _that.triggerType,
          _that.totalSteps,
          _that.completedSteps,
          _that.startedAt,
          _that.completedAt,
          _that.failedAt,
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
      @JsonKey(name: 'workflow_id') String workflowId,
      String status,
      @JsonKey(name: 'trigger_type') String? triggerType,
      @JsonKey(name: 'total_steps') int? totalSteps,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'failed_at') String? failedAt,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto():
        return $default(
          _that.id,
          _that.workflowId,
          _that.status,
          _that.triggerType,
          _that.totalSteps,
          _that.completedSteps,
          _that.startedAt,
          _that.completedAt,
          _that.failedAt,
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
      @JsonKey(name: 'workflow_id') String workflowId,
      String status,
      @JsonKey(name: 'trigger_type') String? triggerType,
      @JsonKey(name: 'total_steps') int? totalSteps,
      @JsonKey(name: 'completed_steps') int? completedSteps,
      @JsonKey(name: 'started_at') String? startedAt,
      @JsonKey(name: 'completed_at') String? completedAt,
      @JsonKey(name: 'failed_at') String? failedAt,
      @JsonKey(name: 'created_at') String createdAt,
      @JsonKey(name: 'updated_at') String updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionSummaryDto() when $default != null:
        return $default(
          _that.id,
          _that.workflowId,
          _that.status,
          _that.triggerType,
          _that.totalSteps,
          _that.completedSteps,
          _that.startedAt,
          _that.completedAt,
          _that.failedAt,
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
class _ExecutionSummaryDto implements ExecutionSummaryDto {
  const _ExecutionSummaryDto({
    required this.id,
    @JsonKey(name: 'workflow_id') required this.workflowId,
    required this.status,
    @JsonKey(name: 'trigger_type') this.triggerType,
    @JsonKey(name: 'total_steps') this.totalSteps,
    @JsonKey(name: 'completed_steps') this.completedSteps,
    @JsonKey(name: 'started_at') this.startedAt,
    @JsonKey(name: 'completed_at') this.completedAt,
    @JsonKey(name: 'failed_at') this.failedAt,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
  });
  factory _ExecutionSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionSummaryDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'workflow_id')
  final String workflowId;
  @override
  final String status;
  @override
  @JsonKey(name: 'trigger_type')
  final String? triggerType;
  @override
  @JsonKey(name: 'total_steps')
  final int? totalSteps;
  @override
  @JsonKey(name: 'completed_steps')
  final int? completedSteps;
  @override
  @JsonKey(name: 'started_at')
  final String? startedAt;
  @override
  @JsonKey(name: 'completed_at')
  final String? completedAt;
  @override
  @JsonKey(name: 'failed_at')
  final String? failedAt;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  /// Create a copy of ExecutionSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ExecutionSummaryDtoCopyWith<_ExecutionSummaryDto> get copyWith =>
      __$ExecutionSummaryDtoCopyWithImpl<_ExecutionSummaryDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ExecutionSummaryDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ExecutionSummaryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.workflowId, workflowId) ||
                other.workflowId == workflowId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.triggerType, triggerType) ||
                other.triggerType == triggerType) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.failedAt, failedAt) ||
                other.failedAt == failedAt) &&
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
    workflowId,
    status,
    triggerType,
    totalSteps,
    completedSteps,
    startedAt,
    completedAt,
    failedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'ExecutionSummaryDto(id: $id, workflowId: $workflowId, status: $status, triggerType: $triggerType, totalSteps: $totalSteps, completedSteps: $completedSteps, startedAt: $startedAt, completedAt: $completedAt, failedAt: $failedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$ExecutionSummaryDtoCopyWith<$Res>
    implements $ExecutionSummaryDtoCopyWith<$Res> {
  factory _$ExecutionSummaryDtoCopyWith(
    _ExecutionSummaryDto value,
    $Res Function(_ExecutionSummaryDto) _then,
  ) = __$ExecutionSummaryDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'workflow_id') String workflowId,
    String status,
    @JsonKey(name: 'trigger_type') String? triggerType,
    @JsonKey(name: 'total_steps') int? totalSteps,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'failed_at') String? failedAt,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class __$ExecutionSummaryDtoCopyWithImpl<$Res>
    implements _$ExecutionSummaryDtoCopyWith<$Res> {
  __$ExecutionSummaryDtoCopyWithImpl(this._self, this._then);

  final _ExecutionSummaryDto _self;
  final $Res Function(_ExecutionSummaryDto) _then;

  /// Create a copy of ExecutionSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? workflowId = null,
    Object? status = null,
    Object? triggerType = freezed,
    Object? totalSteps = freezed,
    Object? completedSteps = freezed,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? failedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _ExecutionSummaryDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        workflowId: null == workflowId
            ? _self.workflowId
            : workflowId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        triggerType: freezed == triggerType
            ? _self.triggerType
            : triggerType // ignore: cast_nullable_to_non_nullable
                  as String?,
        totalSteps: freezed == totalSteps
            ? _self.totalSteps
            : totalSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        completedSteps: freezed == completedSteps
            ? _self.completedSteps
            : completedSteps // ignore: cast_nullable_to_non_nullable
                  as int?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        failedAt: freezed == failedAt
            ? _self.failedAt
            : failedAt // ignore: cast_nullable_to_non_nullable
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
