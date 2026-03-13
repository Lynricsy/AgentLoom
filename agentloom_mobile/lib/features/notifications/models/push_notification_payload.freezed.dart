// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'push_notification_payload.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PushNotificationPayload {
  String get type;
  @JsonKey(name: 'execution_id')
  String? get executionId;
  @JsonKey(name: 'workflow_id')
  String? get workflowId;
  @JsonKey(name: 'node_id')
  String? get nodeId;
  @JsonKey(name: 'notification_id')
  String? get notificationId;

  /// Create a copy of PushNotificationPayload
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $PushNotificationPayloadCopyWith<PushNotificationPayload> get copyWith =>
      _$PushNotificationPayloadCopyWithImpl<PushNotificationPayload>(
        this as PushNotificationPayload,
        _$identity,
      );

  /// Serializes this PushNotificationPayload to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is PushNotificationPayload &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.workflowId, workflowId) ||
                other.workflowId == workflowId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.notificationId, notificationId) ||
                other.notificationId == notificationId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    type,
    executionId,
    workflowId,
    nodeId,
    notificationId,
  );

  @override
  String toString() {
    return 'PushNotificationPayload(type: $type, executionId: $executionId, workflowId: $workflowId, nodeId: $nodeId, notificationId: $notificationId)';
  }
}

/// @nodoc
abstract mixin class $PushNotificationPayloadCopyWith<$Res> {
  factory $PushNotificationPayloadCopyWith(
    PushNotificationPayload value,
    $Res Function(PushNotificationPayload) _then,
  ) = _$PushNotificationPayloadCopyWithImpl;
  @useResult
  $Res call({
    String type,
    @JsonKey(name: 'execution_id') String? executionId,
    @JsonKey(name: 'workflow_id') String? workflowId,
    @JsonKey(name: 'node_id') String? nodeId,
    @JsonKey(name: 'notification_id') String? notificationId,
  });
}

/// @nodoc
class _$PushNotificationPayloadCopyWithImpl<$Res>
    implements $PushNotificationPayloadCopyWith<$Res> {
  _$PushNotificationPayloadCopyWithImpl(this._self, this._then);

  final PushNotificationPayload _self;
  final $Res Function(PushNotificationPayload) _then;

  /// Create a copy of PushNotificationPayload
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? type = null,
    Object? executionId = freezed,
    Object? workflowId = freezed,
    Object? nodeId = freezed,
    Object? notificationId = freezed,
  }) {
    return _then(
      _self.copyWith(
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        workflowId: freezed == workflowId
            ? _self.workflowId
            : workflowId // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeId: freezed == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        notificationId: freezed == notificationId
            ? _self.notificationId
            : notificationId // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [PushNotificationPayload].
extension PushNotificationPayloadPatterns on PushNotificationPayload {
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
    TResult Function(_PushNotificationPayload value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload() when $default != null:
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
    TResult Function(_PushNotificationPayload value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload():
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
    TResult? Function(_PushNotificationPayload value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload() when $default != null:
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
      String type,
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'workflow_id') String? workflowId,
      @JsonKey(name: 'node_id') String? nodeId,
      @JsonKey(name: 'notification_id') String? notificationId,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload() when $default != null:
        return $default(
          _that.type,
          _that.executionId,
          _that.workflowId,
          _that.nodeId,
          _that.notificationId,
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
      String type,
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'workflow_id') String? workflowId,
      @JsonKey(name: 'node_id') String? nodeId,
      @JsonKey(name: 'notification_id') String? notificationId,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload():
        return $default(
          _that.type,
          _that.executionId,
          _that.workflowId,
          _that.nodeId,
          _that.notificationId,
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
      String type,
      @JsonKey(name: 'execution_id') String? executionId,
      @JsonKey(name: 'workflow_id') String? workflowId,
      @JsonKey(name: 'node_id') String? nodeId,
      @JsonKey(name: 'notification_id') String? notificationId,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _PushNotificationPayload() when $default != null:
        return $default(
          _that.type,
          _that.executionId,
          _that.workflowId,
          _that.nodeId,
          _that.notificationId,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _PushNotificationPayload implements PushNotificationPayload {
  const _PushNotificationPayload({
    required this.type,
    @JsonKey(name: 'execution_id') this.executionId,
    @JsonKey(name: 'workflow_id') this.workflowId,
    @JsonKey(name: 'node_id') this.nodeId,
    @JsonKey(name: 'notification_id') this.notificationId,
  });
  factory _PushNotificationPayload.fromJson(Map<String, dynamic> json) =>
      _$PushNotificationPayloadFromJson(json);

  @override
  final String type;
  @override
  @JsonKey(name: 'execution_id')
  final String? executionId;
  @override
  @JsonKey(name: 'workflow_id')
  final String? workflowId;
  @override
  @JsonKey(name: 'node_id')
  final String? nodeId;
  @override
  @JsonKey(name: 'notification_id')
  final String? notificationId;

  /// Create a copy of PushNotificationPayload
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$PushNotificationPayloadCopyWith<_PushNotificationPayload> get copyWith =>
      __$PushNotificationPayloadCopyWithImpl<_PushNotificationPayload>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$PushNotificationPayloadToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _PushNotificationPayload &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.workflowId, workflowId) ||
                other.workflowId == workflowId) &&
            (identical(other.nodeId, nodeId) || other.nodeId == nodeId) &&
            (identical(other.notificationId, notificationId) ||
                other.notificationId == notificationId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    type,
    executionId,
    workflowId,
    nodeId,
    notificationId,
  );

  @override
  String toString() {
    return 'PushNotificationPayload(type: $type, executionId: $executionId, workflowId: $workflowId, nodeId: $nodeId, notificationId: $notificationId)';
  }
}

/// @nodoc
abstract mixin class _$PushNotificationPayloadCopyWith<$Res>
    implements $PushNotificationPayloadCopyWith<$Res> {
  factory _$PushNotificationPayloadCopyWith(
    _PushNotificationPayload value,
    $Res Function(_PushNotificationPayload) _then,
  ) = __$PushNotificationPayloadCopyWithImpl;
  @override
  @useResult
  $Res call({
    String type,
    @JsonKey(name: 'execution_id') String? executionId,
    @JsonKey(name: 'workflow_id') String? workflowId,
    @JsonKey(name: 'node_id') String? nodeId,
    @JsonKey(name: 'notification_id') String? notificationId,
  });
}

/// @nodoc
class __$PushNotificationPayloadCopyWithImpl<$Res>
    implements _$PushNotificationPayloadCopyWith<$Res> {
  __$PushNotificationPayloadCopyWithImpl(this._self, this._then);

  final _PushNotificationPayload _self;
  final $Res Function(_PushNotificationPayload) _then;

  /// Create a copy of PushNotificationPayload
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? type = null,
    Object? executionId = freezed,
    Object? workflowId = freezed,
    Object? nodeId = freezed,
    Object? notificationId = freezed,
  }) {
    return _then(
      _PushNotificationPayload(
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        workflowId: freezed == workflowId
            ? _self.workflowId
            : workflowId // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodeId: freezed == nodeId
            ? _self.nodeId
            : nodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        notificationId: freezed == notificationId
            ? _self.notificationId
            : notificationId // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
