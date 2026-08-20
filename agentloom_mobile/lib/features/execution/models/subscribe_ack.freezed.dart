// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'subscribe_ack.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$SubscribeAck {
  String get status;
  ExecutionStateSnapshot? get currentState;
  String? get error;

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SubscribeAckCopyWith<SubscribeAck> get copyWith =>
      _$SubscribeAckCopyWithImpl<SubscribeAck>(
        this as SubscribeAck,
        _$identity,
      );

  /// Serializes this SubscribeAck to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SubscribeAck &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.currentState, currentState) ||
                other.currentState == currentState) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, status, currentState, error);

  @override
  String toString() {
    return 'SubscribeAck(status: $status, currentState: $currentState, error: $error)';
  }
}

/// @nodoc
abstract mixin class $SubscribeAckCopyWith<$Res> {
  factory $SubscribeAckCopyWith(
    SubscribeAck value,
    $Res Function(SubscribeAck) _then,
  ) = _$SubscribeAckCopyWithImpl;
  @useResult
  $Res call({
    String status,
    ExecutionStateSnapshot? currentState,
    String? error,
  });

  $ExecutionStateSnapshotCopyWith<$Res>? get currentState;
}

/// @nodoc
class _$SubscribeAckCopyWithImpl<$Res> implements $SubscribeAckCopyWith<$Res> {
  _$SubscribeAckCopyWithImpl(this._self, this._then);

  final SubscribeAck _self;
  final $Res Function(SubscribeAck) _then;

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? status = null,
    Object? currentState = freezed,
    Object? error = freezed,
  }) {
    return _then(
      _self.copyWith(
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        currentState: freezed == currentState
            ? _self.currentState
            : currentState // ignore: cast_nullable_to_non_nullable
                  as ExecutionStateSnapshot?,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ExecutionStateSnapshotCopyWith<$Res>? get currentState {
    if (_self.currentState == null) {
      return null;
    }

    return $ExecutionStateSnapshotCopyWith<$Res>(_self.currentState!, (value) {
      return _then(_self.copyWith(currentState: value));
    });
  }
}

/// Adds pattern-matching-related methods to [SubscribeAck].
extension SubscribeAckPatterns on SubscribeAck {
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
    TResult Function(_SubscribeAck value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck() when $default != null:
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
    TResult Function(_SubscribeAck value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck():
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
    TResult? Function(_SubscribeAck value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck() when $default != null:
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
      String status,
      ExecutionStateSnapshot? currentState,
      String? error,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck() when $default != null:
        return $default(_that.status, _that.currentState, _that.error);
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
      String status,
      ExecutionStateSnapshot? currentState,
      String? error,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck():
        return $default(_that.status, _that.currentState, _that.error);
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
      String status,
      ExecutionStateSnapshot? currentState,
      String? error,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SubscribeAck() when $default != null:
        return $default(_that.status, _that.currentState, _that.error);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SubscribeAck implements SubscribeAck {
  const _SubscribeAck({required this.status, this.currentState, this.error});
  factory _SubscribeAck.fromJson(Map<String, dynamic> json) =>
      _$SubscribeAckFromJson(json);

  @override
  final String status;
  @override
  final ExecutionStateSnapshot? currentState;
  @override
  final String? error;

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SubscribeAckCopyWith<_SubscribeAck> get copyWith =>
      __$SubscribeAckCopyWithImpl<_SubscribeAck>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SubscribeAckToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SubscribeAck &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.currentState, currentState) ||
                other.currentState == currentState) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, status, currentState, error);

  @override
  String toString() {
    return 'SubscribeAck(status: $status, currentState: $currentState, error: $error)';
  }
}

/// @nodoc
abstract mixin class _$SubscribeAckCopyWith<$Res>
    implements $SubscribeAckCopyWith<$Res> {
  factory _$SubscribeAckCopyWith(
    _SubscribeAck value,
    $Res Function(_SubscribeAck) _then,
  ) = __$SubscribeAckCopyWithImpl;
  @override
  @useResult
  $Res call({
    String status,
    ExecutionStateSnapshot? currentState,
    String? error,
  });

  @override
  $ExecutionStateSnapshotCopyWith<$Res>? get currentState;
}

/// @nodoc
class __$SubscribeAckCopyWithImpl<$Res>
    implements _$SubscribeAckCopyWith<$Res> {
  __$SubscribeAckCopyWithImpl(this._self, this._then);

  final _SubscribeAck _self;
  final $Res Function(_SubscribeAck) _then;

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? status = null,
    Object? currentState = freezed,
    Object? error = freezed,
  }) {
    return _then(
      _SubscribeAck(
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        currentState: freezed == currentState
            ? _self.currentState
            : currentState // ignore: cast_nullable_to_non_nullable
                  as ExecutionStateSnapshot?,
        error: freezed == error
            ? _self.error
            : error // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of SubscribeAck
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ExecutionStateSnapshotCopyWith<$Res>? get currentState {
    if (_self.currentState == null) {
      return null;
    }

    return $ExecutionStateSnapshotCopyWith<$Res>(_self.currentState!, (value) {
      return _then(_self.copyWith(currentState: value));
    });
  }
}
