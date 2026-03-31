// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'conversation_plan.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ConversationPlan {
  String get systemPrompt;
  int get maxTurns;

  /// Create a copy of ConversationPlan
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationPlanCopyWith<ConversationPlan> get copyWith =>
      _$ConversationPlanCopyWithImpl<ConversationPlan>(
        this as ConversationPlan,
        _$identity,
      );

  /// Serializes this ConversationPlan to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationPlan &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            (identical(other.maxTurns, maxTurns) ||
                other.maxTurns == maxTurns));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, systemPrompt, maxTurns);

  @override
  String toString() {
    return 'ConversationPlan(systemPrompt: $systemPrompt, maxTurns: $maxTurns)';
  }
}

/// @nodoc
abstract mixin class $ConversationPlanCopyWith<$Res> {
  factory $ConversationPlanCopyWith(
    ConversationPlan value,
    $Res Function(ConversationPlan) _then,
  ) = _$ConversationPlanCopyWithImpl;
  @useResult
  $Res call({String systemPrompt, int maxTurns});
}

/// @nodoc
class _$ConversationPlanCopyWithImpl<$Res>
    implements $ConversationPlanCopyWith<$Res> {
  _$ConversationPlanCopyWithImpl(this._self, this._then);

  final ConversationPlan _self;
  final $Res Function(ConversationPlan) _then;

  /// Create a copy of ConversationPlan
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? systemPrompt = null, Object? maxTurns = null}) {
    return _then(
      _self.copyWith(
        systemPrompt: null == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String,
        maxTurns: null == maxTurns
            ? _self.maxTurns
            : maxTurns // ignore: cast_nullable_to_non_nullable
                  as int,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationPlan].
extension ConversationPlanPatterns on ConversationPlan {
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
    TResult Function(_ConversationPlan value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan() when $default != null:
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
    TResult Function(_ConversationPlan value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan():
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
    TResult? Function(_ConversationPlan value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan() when $default != null:
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
    TResult Function(String systemPrompt, int maxTurns)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan() when $default != null:
        return $default(_that.systemPrompt, _that.maxTurns);
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
    TResult Function(String systemPrompt, int maxTurns) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan():
        return $default(_that.systemPrompt, _that.maxTurns);
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
    TResult? Function(String systemPrompt, int maxTurns)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationPlan() when $default != null:
        return $default(_that.systemPrompt, _that.maxTurns);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationPlan implements ConversationPlan {
  const _ConversationPlan({required this.systemPrompt, required this.maxTurns});
  factory _ConversationPlan.fromJson(Map<String, dynamic> json) =>
      _$ConversationPlanFromJson(json);

  @override
  final String systemPrompt;
  @override
  final int maxTurns;

  /// Create a copy of ConversationPlan
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationPlanCopyWith<_ConversationPlan> get copyWith =>
      __$ConversationPlanCopyWithImpl<_ConversationPlan>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationPlanToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationPlan &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            (identical(other.maxTurns, maxTurns) ||
                other.maxTurns == maxTurns));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, systemPrompt, maxTurns);

  @override
  String toString() {
    return 'ConversationPlan(systemPrompt: $systemPrompt, maxTurns: $maxTurns)';
  }
}

/// @nodoc
abstract mixin class _$ConversationPlanCopyWith<$Res>
    implements $ConversationPlanCopyWith<$Res> {
  factory _$ConversationPlanCopyWith(
    _ConversationPlan value,
    $Res Function(_ConversationPlan) _then,
  ) = __$ConversationPlanCopyWithImpl;
  @override
  @useResult
  $Res call({String systemPrompt, int maxTurns});
}

/// @nodoc
class __$ConversationPlanCopyWithImpl<$Res>
    implements _$ConversationPlanCopyWith<$Res> {
  __$ConversationPlanCopyWithImpl(this._self, this._then);

  final _ConversationPlan _self;
  final $Res Function(_ConversationPlan) _then;

  /// Create a copy of ConversationPlan
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({Object? systemPrompt = null, Object? maxTurns = null}) {
    return _then(
      _ConversationPlan(
        systemPrompt: null == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String,
        maxTurns: null == maxTurns
            ? _self.maxTurns
            : maxTurns // ignore: cast_nullable_to_non_nullable
                  as int,
      ),
    );
  }
}
