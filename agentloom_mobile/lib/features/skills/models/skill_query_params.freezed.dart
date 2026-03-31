// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'skill_query_params.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$SkillQueryParams {
  int get page;
  int get pageSize;
  String? get search;
  String? get status;
  bool? get isBuiltin;

  /// Create a copy of SkillQueryParams
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SkillQueryParamsCopyWith<SkillQueryParams> get copyWith =>
      _$SkillQueryParamsCopyWithImpl<SkillQueryParams>(
        this as SkillQueryParams,
        _$identity,
      );

  /// Serializes this SkillQueryParams to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SkillQueryParams &&
            (identical(other.page, page) || other.page == page) &&
            (identical(other.pageSize, pageSize) ||
                other.pageSize == pageSize) &&
            (identical(other.search, search) || other.search == search) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, page, pageSize, search, status, isBuiltin);

  @override
  String toString() {
    return 'SkillQueryParams(page: $page, pageSize: $pageSize, search: $search, status: $status, isBuiltin: $isBuiltin)';
  }
}

/// @nodoc
abstract mixin class $SkillQueryParamsCopyWith<$Res> {
  factory $SkillQueryParamsCopyWith(
    SkillQueryParams value,
    $Res Function(SkillQueryParams) _then,
  ) = _$SkillQueryParamsCopyWithImpl;
  @useResult
  $Res call({
    int page,
    int pageSize,
    String? search,
    String? status,
    bool? isBuiltin,
  });
}

/// @nodoc
class _$SkillQueryParamsCopyWithImpl<$Res>
    implements $SkillQueryParamsCopyWith<$Res> {
  _$SkillQueryParamsCopyWithImpl(this._self, this._then);

  final SkillQueryParams _self;
  final $Res Function(SkillQueryParams) _then;

  /// Create a copy of SkillQueryParams
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? page = null,
    Object? pageSize = null,
    Object? search = freezed,
    Object? status = freezed,
    Object? isBuiltin = freezed,
  }) {
    return _then(
      _self.copyWith(
        page: null == page
            ? _self.page
            : page // ignore: cast_nullable_to_non_nullable
                  as int,
        pageSize: null == pageSize
            ? _self.pageSize
            : pageSize // ignore: cast_nullable_to_non_nullable
                  as int,
        search: freezed == search
            ? _self.search
            : search // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
        isBuiltin: freezed == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [SkillQueryParams].
extension SkillQueryParamsPatterns on SkillQueryParams {
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
    TResult Function(_SkillQueryParams value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams() when $default != null:
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
    TResult Function(_SkillQueryParams value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams():
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
    TResult? Function(_SkillQueryParams value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams() when $default != null:
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
      int page,
      int pageSize,
      String? search,
      String? status,
      bool? isBuiltin,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams() when $default != null:
        return $default(
          _that.page,
          _that.pageSize,
          _that.search,
          _that.status,
          _that.isBuiltin,
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
      int page,
      int pageSize,
      String? search,
      String? status,
      bool? isBuiltin,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams():
        return $default(
          _that.page,
          _that.pageSize,
          _that.search,
          _that.status,
          _that.isBuiltin,
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
      int page,
      int pageSize,
      String? search,
      String? status,
      bool? isBuiltin,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SkillQueryParams() when $default != null:
        return $default(
          _that.page,
          _that.pageSize,
          _that.search,
          _that.status,
          _that.isBuiltin,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SkillQueryParams implements SkillQueryParams {
  const _SkillQueryParams({
    this.page = 1,
    this.pageSize = 20,
    this.search,
    this.status,
    this.isBuiltin,
  });
  factory _SkillQueryParams.fromJson(Map<String, dynamic> json) =>
      _$SkillQueryParamsFromJson(json);

  @override
  @JsonKey()
  final int page;
  @override
  @JsonKey()
  final int pageSize;
  @override
  final String? search;
  @override
  final String? status;
  @override
  final bool? isBuiltin;

  /// Create a copy of SkillQueryParams
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SkillQueryParamsCopyWith<_SkillQueryParams> get copyWith =>
      __$SkillQueryParamsCopyWithImpl<_SkillQueryParams>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SkillQueryParamsToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SkillQueryParams &&
            (identical(other.page, page) || other.page == page) &&
            (identical(other.pageSize, pageSize) ||
                other.pageSize == pageSize) &&
            (identical(other.search, search) || other.search == search) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.isBuiltin, isBuiltin) ||
                other.isBuiltin == isBuiltin));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, page, pageSize, search, status, isBuiltin);

  @override
  String toString() {
    return 'SkillQueryParams(page: $page, pageSize: $pageSize, search: $search, status: $status, isBuiltin: $isBuiltin)';
  }
}

/// @nodoc
abstract mixin class _$SkillQueryParamsCopyWith<$Res>
    implements $SkillQueryParamsCopyWith<$Res> {
  factory _$SkillQueryParamsCopyWith(
    _SkillQueryParams value,
    $Res Function(_SkillQueryParams) _then,
  ) = __$SkillQueryParamsCopyWithImpl;
  @override
  @useResult
  $Res call({
    int page,
    int pageSize,
    String? search,
    String? status,
    bool? isBuiltin,
  });
}

/// @nodoc
class __$SkillQueryParamsCopyWithImpl<$Res>
    implements _$SkillQueryParamsCopyWith<$Res> {
  __$SkillQueryParamsCopyWithImpl(this._self, this._then);

  final _SkillQueryParams _self;
  final $Res Function(_SkillQueryParams) _then;

  /// Create a copy of SkillQueryParams
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? page = null,
    Object? pageSize = null,
    Object? search = freezed,
    Object? status = freezed,
    Object? isBuiltin = freezed,
  }) {
    return _then(
      _SkillQueryParams(
        page: null == page
            ? _self.page
            : page // ignore: cast_nullable_to_non_nullable
                  as int,
        pageSize: null == pageSize
            ? _self.pageSize
            : pageSize // ignore: cast_nullable_to_non_nullable
                  as int,
        search: freezed == search
            ? _self.search
            : search // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
        isBuiltin: freezed == isBuiltin
            ? _self.isBuiltin
            : isBuiltin // ignore: cast_nullable_to_non_nullable
                  as bool?,
      ),
    );
  }
}
