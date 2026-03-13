// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'login_user.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$LoginUser {
  String get id;
  String get email;
  @JsonKey(name: 'display_name')
  String? get displayName;

  /// Create a copy of LoginUser
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $LoginUserCopyWith<LoginUser> get copyWith =>
      _$LoginUserCopyWithImpl<LoginUser>(this as LoginUser, _$identity);

  /// Serializes this LoginUser to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is LoginUser &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.email, email) || other.email == email) &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, email, displayName);

  @override
  String toString() {
    return 'LoginUser(id: $id, email: $email, displayName: $displayName)';
  }
}

/// @nodoc
abstract mixin class $LoginUserCopyWith<$Res> {
  factory $LoginUserCopyWith(LoginUser value, $Res Function(LoginUser) _then) =
      _$LoginUserCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String email,
    @JsonKey(name: 'display_name') String? displayName,
  });
}

/// @nodoc
class _$LoginUserCopyWithImpl<$Res> implements $LoginUserCopyWith<$Res> {
  _$LoginUserCopyWithImpl(this._self, this._then);

  final LoginUser _self;
  final $Res Function(LoginUser) _then;

  /// Create a copy of LoginUser
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? email = null,
    Object? displayName = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        email: null == email
            ? _self.email
            : email // ignore: cast_nullable_to_non_nullable
                  as String,
        displayName: freezed == displayName
            ? _self.displayName
            : displayName // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [LoginUser].
extension LoginUserPatterns on LoginUser {
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
    TResult Function(_LoginUser value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LoginUser() when $default != null:
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
    TResult Function(_LoginUser value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LoginUser():
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
    TResult? Function(_LoginUser value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LoginUser() when $default != null:
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
      String email,
      @JsonKey(name: 'display_name') String? displayName,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _LoginUser() when $default != null:
        return $default(_that.id, _that.email, _that.displayName);
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
      String email,
      @JsonKey(name: 'display_name') String? displayName,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LoginUser():
        return $default(_that.id, _that.email, _that.displayName);
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
      String email,
      @JsonKey(name: 'display_name') String? displayName,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _LoginUser() when $default != null:
        return $default(_that.id, _that.email, _that.displayName);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _LoginUser implements LoginUser {
  const _LoginUser({
    required this.id,
    required this.email,
    @JsonKey(name: 'display_name') this.displayName,
  });
  factory _LoginUser.fromJson(Map<String, dynamic> json) =>
      _$LoginUserFromJson(json);

  @override
  final String id;
  @override
  final String email;
  @override
  @JsonKey(name: 'display_name')
  final String? displayName;

  /// Create a copy of LoginUser
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$LoginUserCopyWith<_LoginUser> get copyWith =>
      __$LoginUserCopyWithImpl<_LoginUser>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$LoginUserToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _LoginUser &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.email, email) || other.email == email) &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, email, displayName);

  @override
  String toString() {
    return 'LoginUser(id: $id, email: $email, displayName: $displayName)';
  }
}

/// @nodoc
abstract mixin class _$LoginUserCopyWith<$Res>
    implements $LoginUserCopyWith<$Res> {
  factory _$LoginUserCopyWith(
    _LoginUser value,
    $Res Function(_LoginUser) _then,
  ) = __$LoginUserCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String email,
    @JsonKey(name: 'display_name') String? displayName,
  });
}

/// @nodoc
class __$LoginUserCopyWithImpl<$Res> implements _$LoginUserCopyWith<$Res> {
  __$LoginUserCopyWithImpl(this._self, this._then);

  final _LoginUser _self;
  final $Res Function(_LoginUser) _then;

  /// Create a copy of LoginUser
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? email = null,
    Object? displayName = freezed,
  }) {
    return _then(
      _LoginUser(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        email: null == email
            ? _self.email
            : email // ignore: cast_nullable_to_non_nullable
                  as String,
        displayName: freezed == displayName
            ? _self.displayName
            : displayName // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
