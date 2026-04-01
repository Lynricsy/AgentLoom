// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'execution_event.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ExecutionEventEnvelope {
  int get eventId;
  String get event;
  String get timestamp;
  String get executionId;
  String? get tenantId;
  Map<String, dynamic> get data;

  /// Create a copy of ExecutionEventEnvelope
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ExecutionEventEnvelopeCopyWith<ExecutionEventEnvelope> get copyWith =>
      _$ExecutionEventEnvelopeCopyWithImpl<ExecutionEventEnvelope>(
        this as ExecutionEventEnvelope,
        _$identity,
      );

  /// Serializes this ExecutionEventEnvelope to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ExecutionEventEnvelope &&
            (identical(other.eventId, eventId) || other.eventId == eventId) &&
            (identical(other.event, event) || other.event == event) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            const DeepCollectionEquality().equals(other.data, data));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    eventId,
    event,
    timestamp,
    executionId,
    tenantId,
    const DeepCollectionEquality().hash(data),
  );

  @override
  String toString() {
    return 'ExecutionEventEnvelope(eventId: $eventId, event: $event, timestamp: $timestamp, executionId: $executionId, tenantId: $tenantId, data: $data)';
  }
}

/// @nodoc
abstract mixin class $ExecutionEventEnvelopeCopyWith<$Res> {
  factory $ExecutionEventEnvelopeCopyWith(
    ExecutionEventEnvelope value,
    $Res Function(ExecutionEventEnvelope) _then,
  ) = _$ExecutionEventEnvelopeCopyWithImpl;
  @useResult
  $Res call({
    int eventId,
    String event,
    String timestamp,
    String executionId,
    String? tenantId,
    Map<String, dynamic> data,
  });
}

/// @nodoc
class _$ExecutionEventEnvelopeCopyWithImpl<$Res>
    implements $ExecutionEventEnvelopeCopyWith<$Res> {
  _$ExecutionEventEnvelopeCopyWithImpl(this._self, this._then);

  final ExecutionEventEnvelope _self;
  final $Res Function(ExecutionEventEnvelope) _then;

  /// Create a copy of ExecutionEventEnvelope
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? eventId = null,
    Object? event = null,
    Object? timestamp = null,
    Object? executionId = null,
    Object? tenantId = freezed,
    Object? data = null,
  }) {
    return _then(
      _self.copyWith(
        eventId: null == eventId
            ? _self.eventId
            : eventId // ignore: cast_nullable_to_non_nullable
                  as int,
        event: null == event
            ? _self.event
            : event // ignore: cast_nullable_to_non_nullable
                  as String,
        timestamp: null == timestamp
            ? _self.timestamp
            : timestamp // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: null == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: freezed == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String?,
        data: null == data
            ? _self.data
            : data // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ExecutionEventEnvelope].
extension ExecutionEventEnvelopePatterns on ExecutionEventEnvelope {
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
    TResult Function(_ExecutionEventEnvelope value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope() when $default != null:
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
    TResult Function(_ExecutionEventEnvelope value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope():
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
    TResult? Function(_ExecutionEventEnvelope value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope() when $default != null:
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
      int eventId,
      String event,
      String timestamp,
      String executionId,
      String? tenantId,
      Map<String, dynamic> data,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope() when $default != null:
        return $default(
          _that.eventId,
          _that.event,
          _that.timestamp,
          _that.executionId,
          _that.tenantId,
          _that.data,
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
      int eventId,
      String event,
      String timestamp,
      String executionId,
      String? tenantId,
      Map<String, dynamic> data,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope():
        return $default(
          _that.eventId,
          _that.event,
          _that.timestamp,
          _that.executionId,
          _that.tenantId,
          _that.data,
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
      int eventId,
      String event,
      String timestamp,
      String executionId,
      String? tenantId,
      Map<String, dynamic> data,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionEventEnvelope() when $default != null:
        return $default(
          _that.eventId,
          _that.event,
          _that.timestamp,
          _that.executionId,
          _that.tenantId,
          _that.data,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc

@JsonSerializable(fieldRename: FieldRename.snake)
class _ExecutionEventEnvelope implements ExecutionEventEnvelope {
  const _ExecutionEventEnvelope({
    required this.eventId,
    required this.event,
    required this.timestamp,
    required this.executionId,
    this.tenantId,
    required final Map<String, dynamic> data,
  }) : _data = data;
  factory _ExecutionEventEnvelope.fromJson(Map<String, dynamic> json) =>
      _$ExecutionEventEnvelopeFromJson(json);

  @override
  final int eventId;
  @override
  final String event;
  @override
  final String timestamp;
  @override
  final String executionId;
  @override
  final String? tenantId;
  final Map<String, dynamic> _data;
  @override
  Map<String, dynamic> get data {
    if (_data is EqualUnmodifiableMapView) return _data;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_data);
  }

  /// Create a copy of ExecutionEventEnvelope
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ExecutionEventEnvelopeCopyWith<_ExecutionEventEnvelope> get copyWith =>
      __$ExecutionEventEnvelopeCopyWithImpl<_ExecutionEventEnvelope>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ExecutionEventEnvelopeToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ExecutionEventEnvelope &&
            (identical(other.eventId, eventId) || other.eventId == eventId) &&
            (identical(other.event, event) || other.event == event) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            const DeepCollectionEquality().equals(other._data, _data));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    eventId,
    event,
    timestamp,
    executionId,
    tenantId,
    const DeepCollectionEquality().hash(_data),
  );

  @override
  String toString() {
    return 'ExecutionEventEnvelope(eventId: $eventId, event: $event, timestamp: $timestamp, executionId: $executionId, tenantId: $tenantId, data: $data)';
  }
}

/// @nodoc
abstract mixin class _$ExecutionEventEnvelopeCopyWith<$Res>
    implements $ExecutionEventEnvelopeCopyWith<$Res> {
  factory _$ExecutionEventEnvelopeCopyWith(
    _ExecutionEventEnvelope value,
    $Res Function(_ExecutionEventEnvelope) _then,
  ) = __$ExecutionEventEnvelopeCopyWithImpl;
  @override
  @useResult
  $Res call({
    int eventId,
    String event,
    String timestamp,
    String executionId,
    String? tenantId,
    Map<String, dynamic> data,
  });
}

/// @nodoc
class __$ExecutionEventEnvelopeCopyWithImpl<$Res>
    implements _$ExecutionEventEnvelopeCopyWith<$Res> {
  __$ExecutionEventEnvelopeCopyWithImpl(this._self, this._then);

  final _ExecutionEventEnvelope _self;
  final $Res Function(_ExecutionEventEnvelope) _then;

  /// Create a copy of ExecutionEventEnvelope
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? eventId = null,
    Object? event = null,
    Object? timestamp = null,
    Object? executionId = null,
    Object? tenantId = freezed,
    Object? data = null,
  }) {
    return _then(
      _ExecutionEventEnvelope(
        eventId: null == eventId
            ? _self.eventId
            : eventId // ignore: cast_nullable_to_non_nullable
                  as int,
        event: null == event
            ? _self.event
            : event // ignore: cast_nullable_to_non_nullable
                  as String,
        timestamp: null == timestamp
            ? _self.timestamp
            : timestamp // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: null == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: freezed == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String?,
        data: null == data
            ? _self._data
            : data // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>,
      ),
    );
  }
}

/// @nodoc
mixin _$ExecutionStatusChangedData {
  String get executionId;
  String get status;
  int? get completedSteps;
  int? get totalSteps;
  String? get errorMessage;

  /// Create a copy of ExecutionStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ExecutionStatusChangedDataCopyWith<ExecutionStatusChangedData>
  get copyWith =>
      _$ExecutionStatusChangedDataCopyWithImpl<ExecutionStatusChangedData>(
        this as ExecutionStatusChangedData,
        _$identity,
      );

  /// Serializes this ExecutionStatusChangedData to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ExecutionStatusChangedData &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    executionId,
    status,
    completedSteps,
    totalSteps,
    errorMessage,
  );

  @override
  String toString() {
    return 'ExecutionStatusChangedData(executionId: $executionId, status: $status, completedSteps: $completedSteps, totalSteps: $totalSteps, errorMessage: $errorMessage)';
  }
}

/// @nodoc
abstract mixin class $ExecutionStatusChangedDataCopyWith<$Res> {
  factory $ExecutionStatusChangedDataCopyWith(
    ExecutionStatusChangedData value,
    $Res Function(ExecutionStatusChangedData) _then,
  ) = _$ExecutionStatusChangedDataCopyWithImpl;
  @useResult
  $Res call({
    String executionId,
    String status,
    int? completedSteps,
    int? totalSteps,
    String? errorMessage,
  });
}

/// @nodoc
class _$ExecutionStatusChangedDataCopyWithImpl<$Res>
    implements $ExecutionStatusChangedDataCopyWith<$Res> {
  _$ExecutionStatusChangedDataCopyWithImpl(this._self, this._then);

  final ExecutionStatusChangedData _self;
  final $Res Function(ExecutionStatusChangedData) _then;

  /// Create a copy of ExecutionStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? executionId = null,
    Object? status = null,
    Object? completedSteps = freezed,
    Object? totalSteps = freezed,
    Object? errorMessage = freezed,
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
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ExecutionStatusChangedData].
extension ExecutionStatusChangedDataPatterns on ExecutionStatusChangedData {
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
    TResult Function(_ExecutionStatusChangedData value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData() when $default != null:
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
    TResult Function(_ExecutionStatusChangedData value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData():
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
    TResult? Function(_ExecutionStatusChangedData value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData() when $default != null:
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
      String executionId,
      String status,
      int? completedSteps,
      int? totalSteps,
      String? errorMessage,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData() when $default != null:
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.errorMessage,
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
      String executionId,
      String status,
      int? completedSteps,
      int? totalSteps,
      String? errorMessage,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData():
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.errorMessage,
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
      String executionId,
      String status,
      int? completedSteps,
      int? totalSteps,
      String? errorMessage,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ExecutionStatusChangedData() when $default != null:
        return $default(
          _that.executionId,
          _that.status,
          _that.completedSteps,
          _that.totalSteps,
          _that.errorMessage,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc

@JsonSerializable(fieldRename: FieldRename.snake)
class _ExecutionStatusChangedData implements ExecutionStatusChangedData {
  const _ExecutionStatusChangedData({
    required this.executionId,
    required this.status,
    this.completedSteps,
    this.totalSteps,
    this.errorMessage,
  });
  factory _ExecutionStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStatusChangedDataFromJson(json);

  @override
  final String executionId;
  @override
  final String status;
  @override
  final int? completedSteps;
  @override
  final int? totalSteps;
  @override
  final String? errorMessage;

  /// Create a copy of ExecutionStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ExecutionStatusChangedDataCopyWith<_ExecutionStatusChangedData>
  get copyWith =>
      __$ExecutionStatusChangedDataCopyWithImpl<_ExecutionStatusChangedData>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ExecutionStatusChangedDataToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ExecutionStatusChangedData &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.completedSteps, completedSteps) ||
                other.completedSteps == completedSteps) &&
            (identical(other.totalSteps, totalSteps) ||
                other.totalSteps == totalSteps) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    executionId,
    status,
    completedSteps,
    totalSteps,
    errorMessage,
  );

  @override
  String toString() {
    return 'ExecutionStatusChangedData(executionId: $executionId, status: $status, completedSteps: $completedSteps, totalSteps: $totalSteps, errorMessage: $errorMessage)';
  }
}

/// @nodoc
abstract mixin class _$ExecutionStatusChangedDataCopyWith<$Res>
    implements $ExecutionStatusChangedDataCopyWith<$Res> {
  factory _$ExecutionStatusChangedDataCopyWith(
    _ExecutionStatusChangedData value,
    $Res Function(_ExecutionStatusChangedData) _then,
  ) = __$ExecutionStatusChangedDataCopyWithImpl;
  @override
  @useResult
  $Res call({
    String executionId,
    String status,
    int? completedSteps,
    int? totalSteps,
    String? errorMessage,
  });
}

/// @nodoc
class __$ExecutionStatusChangedDataCopyWithImpl<$Res>
    implements _$ExecutionStatusChangedDataCopyWith<$Res> {
  __$ExecutionStatusChangedDataCopyWithImpl(this._self, this._then);

  final _ExecutionStatusChangedData _self;
  final $Res Function(_ExecutionStatusChangedData) _then;

  /// Create a copy of ExecutionStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? executionId = null,
    Object? status = null,
    Object? completedSteps = freezed,
    Object? totalSteps = freezed,
    Object? errorMessage = freezed,
  }) {
    return _then(
      _ExecutionStatusChangedData(
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
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$NodeStatusChangedData {
  String get stepId;
  String get nodeId;
  String? get nodeName;
  String? get nodeType;
  String get from;
  String get to;
  String? get startedAt;
  String? get completedAt;
  Map<String, dynamic>? get errorDetail;
  String? get errorMessage;

  /// Create a copy of NodeStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $NodeStatusChangedDataCopyWith<NodeStatusChangedData> get copyWith =>
      _$NodeStatusChangedDataCopyWithImpl<NodeStatusChangedData>(
        this as NodeStatusChangedData,
        _$identity,
      );

  /// Serializes this NodeStatusChangedData to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is NodeStatusChangedData &&
            (identical(other.stepId, stepId) || other.stepId == stepId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.nodeName, nodeName) ||
                other.nodeName == nodeName) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            (identical(other.from, from) || other.from == from) &&
            (identical(other.to, to) || other.to == to) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            const DeepCollectionEquality().equals(
              other.errorDetail,
              errorDetail,
            ) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    stepId,
    nodeId,
    nodeName,
    nodeType,
    from,
    to,
    startedAt,
    completedAt,
    const DeepCollectionEquality().hash(errorDetail),
    errorMessage,
  );

  @override
  String toString() {
    return 'NodeStatusChangedData(stepId: $stepId, nodeId: $nodeId, nodeName: $nodeName, nodeType: $nodeType, from: $from, to: $to, startedAt: $startedAt, completedAt: $completedAt, errorDetail: $errorDetail, errorMessage: $errorMessage)';
  }
}

/// @nodoc
abstract mixin class $NodeStatusChangedDataCopyWith<$Res> {
  factory $NodeStatusChangedDataCopyWith(
    NodeStatusChangedData value,
    $Res Function(NodeStatusChangedData) _then,
  ) = _$NodeStatusChangedDataCopyWithImpl;
  @useResult
  $Res call({
    String stepId,
    String nodeId,
    String? nodeName,
    String? nodeType,
    String from,
    String to,
    String? startedAt,
    String? completedAt,
    Map<String, dynamic>? errorDetail,
    String? errorMessage,
  });
}

/// @nodoc
class _$NodeStatusChangedDataCopyWithImpl<$Res>
    implements $NodeStatusChangedDataCopyWith<$Res> {
  _$NodeStatusChangedDataCopyWithImpl(this._self, this._then);

  final NodeStatusChangedData _self;
  final $Res Function(NodeStatusChangedData) _then;

  /// Create a copy of NodeStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? stepId = null,
    Object? nodeId = null,
    Object? nodeName = freezed,
    Object? nodeType = freezed,
    Object? from = null,
    Object? to = null,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? errorDetail = freezed,
    Object? errorMessage = freezed,
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
        from: null == from
            ? _self.from
            : from // ignore: cast_nullable_to_non_nullable
                  as String,
        to: null == to
            ? _self.to
            : to // ignore: cast_nullable_to_non_nullable
                  as String,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorDetail: freezed == errorDetail
            ? _self.errorDetail
            : errorDetail // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [NodeStatusChangedData].
extension NodeStatusChangedDataPatterns on NodeStatusChangedData {
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
    TResult Function(_NodeStatusChangedData value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData() when $default != null:
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
    TResult Function(_NodeStatusChangedData value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData():
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
    TResult? Function(_NodeStatusChangedData value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData() when $default != null:
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
      String stepId,
      String nodeId,
      String? nodeName,
      String? nodeType,
      String from,
      String to,
      String? startedAt,
      String? completedAt,
      Map<String, dynamic>? errorDetail,
      String? errorMessage,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData() when $default != null:
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.from,
          _that.to,
          _that.startedAt,
          _that.completedAt,
          _that.errorDetail,
          _that.errorMessage,
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
      String stepId,
      String nodeId,
      String? nodeName,
      String? nodeType,
      String from,
      String to,
      String? startedAt,
      String? completedAt,
      Map<String, dynamic>? errorDetail,
      String? errorMessage,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData():
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.from,
          _that.to,
          _that.startedAt,
          _that.completedAt,
          _that.errorDetail,
          _that.errorMessage,
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
      String stepId,
      String nodeId,
      String? nodeName,
      String? nodeType,
      String from,
      String to,
      String? startedAt,
      String? completedAt,
      Map<String, dynamic>? errorDetail,
      String? errorMessage,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _NodeStatusChangedData() when $default != null:
        return $default(
          _that.stepId,
          _that.nodeId,
          _that.nodeName,
          _that.nodeType,
          _that.from,
          _that.to,
          _that.startedAt,
          _that.completedAt,
          _that.errorDetail,
          _that.errorMessage,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc

@JsonSerializable(fieldRename: FieldRename.snake)
class _NodeStatusChangedData implements NodeStatusChangedData {
  const _NodeStatusChangedData({
    required this.stepId,
    required this.nodeId,
    this.nodeName,
    this.nodeType,
    required this.from,
    required this.to,
    this.startedAt,
    this.completedAt,
    final Map<String, dynamic>? errorDetail,
    this.errorMessage,
  }) : _errorDetail = errorDetail;
  factory _NodeStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$NodeStatusChangedDataFromJson(json);

  @override
  final String stepId;
  @override
  final String nodeId;
  @override
  final String? nodeName;
  @override
  final String? nodeType;
  @override
  final String from;
  @override
  final String to;
  @override
  final String? startedAt;
  @override
  final String? completedAt;
  final Map<String, dynamic>? _errorDetail;
  @override
  Map<String, dynamic>? get errorDetail {
    final value = _errorDetail;
    if (value == null) return null;
    if (_errorDetail is EqualUnmodifiableMapView) return _errorDetail;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final String? errorMessage;

  /// Create a copy of NodeStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$NodeStatusChangedDataCopyWith<_NodeStatusChangedData> get copyWith =>
      __$NodeStatusChangedDataCopyWithImpl<_NodeStatusChangedData>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$NodeStatusChangedDataToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _NodeStatusChangedData &&
            (identical(other.stepId, stepId) || other.stepId == stepId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.nodeName, nodeName) ||
                other.nodeName == nodeName) &&
            (identical(other.nodeType, nodeType) ||
                other.nodeType == nodeType) &&
            (identical(other.from, from) || other.from == from) &&
            (identical(other.to, to) || other.to == to) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            const DeepCollectionEquality().equals(
              other._errorDetail,
              _errorDetail,
            ) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    stepId,
    nodeId,
    nodeName,
    nodeType,
    from,
    to,
    startedAt,
    completedAt,
    const DeepCollectionEquality().hash(_errorDetail),
    errorMessage,
  );

  @override
  String toString() {
    return 'NodeStatusChangedData(stepId: $stepId, nodeId: $nodeId, nodeName: $nodeName, nodeType: $nodeType, from: $from, to: $to, startedAt: $startedAt, completedAt: $completedAt, errorDetail: $errorDetail, errorMessage: $errorMessage)';
  }
}

/// @nodoc
abstract mixin class _$NodeStatusChangedDataCopyWith<$Res>
    implements $NodeStatusChangedDataCopyWith<$Res> {
  factory _$NodeStatusChangedDataCopyWith(
    _NodeStatusChangedData value,
    $Res Function(_NodeStatusChangedData) _then,
  ) = __$NodeStatusChangedDataCopyWithImpl;
  @override
  @useResult
  $Res call({
    String stepId,
    String nodeId,
    String? nodeName,
    String? nodeType,
    String from,
    String to,
    String? startedAt,
    String? completedAt,
    Map<String, dynamic>? errorDetail,
    String? errorMessage,
  });
}

/// @nodoc
class __$NodeStatusChangedDataCopyWithImpl<$Res>
    implements _$NodeStatusChangedDataCopyWith<$Res> {
  __$NodeStatusChangedDataCopyWithImpl(this._self, this._then);

  final _NodeStatusChangedData _self;
  final $Res Function(_NodeStatusChangedData) _then;

  /// Create a copy of NodeStatusChangedData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? stepId = null,
    Object? nodeId = null,
    Object? nodeName = freezed,
    Object? nodeType = freezed,
    Object? from = null,
    Object? to = null,
    Object? startedAt = freezed,
    Object? completedAt = freezed,
    Object? errorDetail = freezed,
    Object? errorMessage = freezed,
  }) {
    return _then(
      _NodeStatusChangedData(
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
        from: null == from
            ? _self.from
            : from // ignore: cast_nullable_to_non_nullable
                  as String,
        to: null == to
            ? _self.to
            : to // ignore: cast_nullable_to_non_nullable
                  as String,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        completedAt: freezed == completedAt
            ? _self.completedAt
            : completedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        errorDetail: freezed == errorDetail
            ? _self._errorDetail
            : errorDetail // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        errorMessage: freezed == errorMessage
            ? _self.errorMessage
            : errorMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
