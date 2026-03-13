// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'auth_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AuthState {
  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType && other is AuthState);
  }

  @override
  int get hashCode => runtimeType.hashCode;

  @override
  String toString() {
    return 'AuthState()';
  }
}

/// @nodoc
class $AuthStateCopyWith<$Res> {
  $AuthStateCopyWith(AuthState _, $Res Function(AuthState) __);
}

/// Adds pattern-matching-related methods to [AuthState].
extension AuthStatePatterns on AuthState {
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
  TResult maybeMap<TResult extends Object?>({
    TResult Function(AuthStateInitial value)? initial,
    TResult Function(AuthStateAuthenticated value)? authenticated,
    TResult Function(AuthStateUnauthenticated value)? unauthenticated,
    TResult Function(AuthStateMfaRequired value)? mfaRequired,
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial() when initial != null:
        return initial(_that);
      case AuthStateAuthenticated() when authenticated != null:
        return authenticated(_that);
      case AuthStateUnauthenticated() when unauthenticated != null:
        return unauthenticated(_that);
      case AuthStateMfaRequired() when mfaRequired != null:
        return mfaRequired(_that);
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
  TResult map<TResult extends Object?>({
    required TResult Function(AuthStateInitial value) initial,
    required TResult Function(AuthStateAuthenticated value) authenticated,
    required TResult Function(AuthStateUnauthenticated value) unauthenticated,
    required TResult Function(AuthStateMfaRequired value) mfaRequired,
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial():
        return initial(_that);
      case AuthStateAuthenticated():
        return authenticated(_that);
      case AuthStateUnauthenticated():
        return unauthenticated(_that);
      case AuthStateMfaRequired():
        return mfaRequired(_that);
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
  TResult? mapOrNull<TResult extends Object?>({
    TResult? Function(AuthStateInitial value)? initial,
    TResult? Function(AuthStateAuthenticated value)? authenticated,
    TResult? Function(AuthStateUnauthenticated value)? unauthenticated,
    TResult? Function(AuthStateMfaRequired value)? mfaRequired,
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial() when initial != null:
        return initial(_that);
      case AuthStateAuthenticated() when authenticated != null:
        return authenticated(_that);
      case AuthStateUnauthenticated() when unauthenticated != null:
        return unauthenticated(_that);
      case AuthStateMfaRequired() when mfaRequired != null:
        return mfaRequired(_that);
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
  TResult maybeWhen<TResult extends Object?>({
    TResult Function()? initial,
    TResult Function(LoginUser user, AuthTokens tokens)? authenticated,
    TResult Function(String? message)? unauthenticated,
    TResult Function(String mfaToken, List<Map<String, dynamic>> factors)?
    mfaRequired,
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial() when initial != null:
        return initial();
      case AuthStateAuthenticated() when authenticated != null:
        return authenticated(_that.user, _that.tokens);
      case AuthStateUnauthenticated() when unauthenticated != null:
        return unauthenticated(_that.message);
      case AuthStateMfaRequired() when mfaRequired != null:
        return mfaRequired(_that.mfaToken, _that.factors);
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
  TResult when<TResult extends Object?>({
    required TResult Function() initial,
    required TResult Function(LoginUser user, AuthTokens tokens) authenticated,
    required TResult Function(String? message) unauthenticated,
    required TResult Function(
      String mfaToken,
      List<Map<String, dynamic>> factors,
    )
    mfaRequired,
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial():
        return initial();
      case AuthStateAuthenticated():
        return authenticated(_that.user, _that.tokens);
      case AuthStateUnauthenticated():
        return unauthenticated(_that.message);
      case AuthStateMfaRequired():
        return mfaRequired(_that.mfaToken, _that.factors);
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
  TResult? whenOrNull<TResult extends Object?>({
    TResult? Function()? initial,
    TResult? Function(LoginUser user, AuthTokens tokens)? authenticated,
    TResult? Function(String? message)? unauthenticated,
    TResult? Function(String mfaToken, List<Map<String, dynamic>> factors)?
    mfaRequired,
  }) {
    final _that = this;
    switch (_that) {
      case AuthStateInitial() when initial != null:
        return initial();
      case AuthStateAuthenticated() when authenticated != null:
        return authenticated(_that.user, _that.tokens);
      case AuthStateUnauthenticated() when unauthenticated != null:
        return unauthenticated(_that.message);
      case AuthStateMfaRequired() when mfaRequired != null:
        return mfaRequired(_that.mfaToken, _that.factors);
      case _:
        return null;
    }
  }
}

/// @nodoc

class AuthStateInitial implements AuthState {
  const AuthStateInitial();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType && other is AuthStateInitial);
  }

  @override
  int get hashCode => runtimeType.hashCode;

  @override
  String toString() {
    return 'AuthState.initial()';
  }
}

/// @nodoc

class AuthStateAuthenticated implements AuthState {
  const AuthStateAuthenticated({required this.user, required this.tokens});

  final LoginUser user;
  final AuthTokens tokens;

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AuthStateAuthenticatedCopyWith<AuthStateAuthenticated> get copyWith =>
      _$AuthStateAuthenticatedCopyWithImpl<AuthStateAuthenticated>(
        this,
        _$identity,
      );

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AuthStateAuthenticated &&
            (identical(other.user, user) || other.user == user) &&
            (identical(other.tokens, tokens) || other.tokens == tokens));
  }

  @override
  int get hashCode => Object.hash(runtimeType, user, tokens);

  @override
  String toString() {
    return 'AuthState.authenticated(user: $user, tokens: $tokens)';
  }
}

/// @nodoc
abstract mixin class $AuthStateAuthenticatedCopyWith<$Res>
    implements $AuthStateCopyWith<$Res> {
  factory $AuthStateAuthenticatedCopyWith(
    AuthStateAuthenticated value,
    $Res Function(AuthStateAuthenticated) _then,
  ) = _$AuthStateAuthenticatedCopyWithImpl;
  @useResult
  $Res call({LoginUser user, AuthTokens tokens});

  $LoginUserCopyWith<$Res> get user;
  $AuthTokensCopyWith<$Res> get tokens;
}

/// @nodoc
class _$AuthStateAuthenticatedCopyWithImpl<$Res>
    implements $AuthStateAuthenticatedCopyWith<$Res> {
  _$AuthStateAuthenticatedCopyWithImpl(this._self, this._then);

  final AuthStateAuthenticated _self;
  final $Res Function(AuthStateAuthenticated) _then;

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  $Res call({Object? user = null, Object? tokens = null}) {
    return _then(
      AuthStateAuthenticated(
        user: null == user
            ? _self.user
            : user // ignore: cast_nullable_to_non_nullable
                  as LoginUser,
        tokens: null == tokens
            ? _self.tokens
            : tokens // ignore: cast_nullable_to_non_nullable
                  as AuthTokens,
      ),
    );
  }

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $LoginUserCopyWith<$Res> get user {
    return $LoginUserCopyWith<$Res>(_self.user, (value) {
      return _then(_self.copyWith(user: value));
    });
  }

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $AuthTokensCopyWith<$Res> get tokens {
    return $AuthTokensCopyWith<$Res>(_self.tokens, (value) {
      return _then(_self.copyWith(tokens: value));
    });
  }
}

/// @nodoc

class AuthStateUnauthenticated implements AuthState {
  const AuthStateUnauthenticated({this.message});

  final String? message;

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AuthStateUnauthenticatedCopyWith<AuthStateUnauthenticated> get copyWith =>
      _$AuthStateUnauthenticatedCopyWithImpl<AuthStateUnauthenticated>(
        this,
        _$identity,
      );

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AuthStateUnauthenticated &&
            (identical(other.message, message) || other.message == message));
  }

  @override
  int get hashCode => Object.hash(runtimeType, message);

  @override
  String toString() {
    return 'AuthState.unauthenticated(message: $message)';
  }
}

/// @nodoc
abstract mixin class $AuthStateUnauthenticatedCopyWith<$Res>
    implements $AuthStateCopyWith<$Res> {
  factory $AuthStateUnauthenticatedCopyWith(
    AuthStateUnauthenticated value,
    $Res Function(AuthStateUnauthenticated) _then,
  ) = _$AuthStateUnauthenticatedCopyWithImpl;
  @useResult
  $Res call({String? message});
}

/// @nodoc
class _$AuthStateUnauthenticatedCopyWithImpl<$Res>
    implements $AuthStateUnauthenticatedCopyWith<$Res> {
  _$AuthStateUnauthenticatedCopyWithImpl(this._self, this._then);

  final AuthStateUnauthenticated _self;
  final $Res Function(AuthStateUnauthenticated) _then;

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  $Res call({Object? message = freezed}) {
    return _then(
      AuthStateUnauthenticated(
        message: freezed == message
            ? _self.message
            : message // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc

class AuthStateMfaRequired implements AuthState {
  const AuthStateMfaRequired({
    required this.mfaToken,
    required final List<Map<String, dynamic>> factors,
  }) : _factors = factors;

  final String mfaToken;
  final List<Map<String, dynamic>> _factors;
  List<Map<String, dynamic>> get factors {
    if (_factors is EqualUnmodifiableListView) return _factors;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_factors);
  }

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AuthStateMfaRequiredCopyWith<AuthStateMfaRequired> get copyWith =>
      _$AuthStateMfaRequiredCopyWithImpl<AuthStateMfaRequired>(
        this,
        _$identity,
      );

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AuthStateMfaRequired &&
            (identical(other.mfaToken, mfaToken) ||
                other.mfaToken == mfaToken) &&
            const DeepCollectionEquality().equals(other._factors, _factors));
  }

  @override
  int get hashCode => Object.hash(
    runtimeType,
    mfaToken,
    const DeepCollectionEquality().hash(_factors),
  );

  @override
  String toString() {
    return 'AuthState.mfaRequired(mfaToken: $mfaToken, factors: $factors)';
  }
}

/// @nodoc
abstract mixin class $AuthStateMfaRequiredCopyWith<$Res>
    implements $AuthStateCopyWith<$Res> {
  factory $AuthStateMfaRequiredCopyWith(
    AuthStateMfaRequired value,
    $Res Function(AuthStateMfaRequired) _then,
  ) = _$AuthStateMfaRequiredCopyWithImpl;
  @useResult
  $Res call({String mfaToken, List<Map<String, dynamic>> factors});
}

/// @nodoc
class _$AuthStateMfaRequiredCopyWithImpl<$Res>
    implements $AuthStateMfaRequiredCopyWith<$Res> {
  _$AuthStateMfaRequiredCopyWithImpl(this._self, this._then);

  final AuthStateMfaRequired _self;
  final $Res Function(AuthStateMfaRequired) _then;

  /// Create a copy of AuthState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  $Res call({Object? mfaToken = null, Object? factors = null}) {
    return _then(
      AuthStateMfaRequired(
        mfaToken: null == mfaToken
            ? _self.mfaToken
            : mfaToken // ignore: cast_nullable_to_non_nullable
                  as String,
        factors: null == factors
            ? _self._factors
            : factors // ignore: cast_nullable_to_non_nullable
                  as List<Map<String, dynamic>>,
      ),
    );
  }
}
