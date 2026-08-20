// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'mcp_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$McpConnectionConfigDto {
  String get transportType;
  String? get command;
  List<String> get args;
  Map<String, String>? get env;
  String? get url;
  Map<String, String>? get headers;

  /// Create a copy of McpConnectionConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpConnectionConfigDtoCopyWith<McpConnectionConfigDto> get copyWith =>
      _$McpConnectionConfigDtoCopyWithImpl<McpConnectionConfigDto>(
        this as McpConnectionConfigDto,
        _$identity,
      );

  /// Serializes this McpConnectionConfigDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpConnectionConfigDto &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.command, command) || other.command == command) &&
            const DeepCollectionEquality().equals(other.args, args) &&
            const DeepCollectionEquality().equals(other.env, env) &&
            (identical(other.url, url) || other.url == url) &&
            const DeepCollectionEquality().equals(other.headers, headers));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    transportType,
    command,
    const DeepCollectionEquality().hash(args),
    const DeepCollectionEquality().hash(env),
    url,
    const DeepCollectionEquality().hash(headers),
  );

  @override
  String toString() {
    return 'McpConnectionConfigDto(transportType: $transportType, command: $command, args: $args, env: $env, url: $url, headers: $headers)';
  }
}

/// @nodoc
abstract mixin class $McpConnectionConfigDtoCopyWith<$Res> {
  factory $McpConnectionConfigDtoCopyWith(
    McpConnectionConfigDto value,
    $Res Function(McpConnectionConfigDto) _then,
  ) = _$McpConnectionConfigDtoCopyWithImpl;
  @useResult
  $Res call({
    String transportType,
    String? command,
    List<String> args,
    Map<String, String>? env,
    String? url,
    Map<String, String>? headers,
  });
}

/// @nodoc
class _$McpConnectionConfigDtoCopyWithImpl<$Res>
    implements $McpConnectionConfigDtoCopyWith<$Res> {
  _$McpConnectionConfigDtoCopyWithImpl(this._self, this._then);

  final McpConnectionConfigDto _self;
  final $Res Function(McpConnectionConfigDto) _then;

  /// Create a copy of McpConnectionConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? transportType = null,
    Object? command = freezed,
    Object? args = null,
    Object? env = freezed,
    Object? url = freezed,
    Object? headers = freezed,
  }) {
    return _then(
      _self.copyWith(
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        command: freezed == command
            ? _self.command
            : command // ignore: cast_nullable_to_non_nullable
                  as String?,
        args: null == args
            ? _self.args
            : args // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        env: freezed == env
            ? _self.env
            : env // ignore: cast_nullable_to_non_nullable
                  as Map<String, String>?,
        url: freezed == url
            ? _self.url
            : url // ignore: cast_nullable_to_non_nullable
                  as String?,
        headers: freezed == headers
            ? _self.headers
            : headers // ignore: cast_nullable_to_non_nullable
                  as Map<String, String>?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [McpConnectionConfigDto].
extension McpConnectionConfigDtoPatterns on McpConnectionConfigDto {
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
    TResult Function(_McpConnectionConfigDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto() when $default != null:
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
    TResult Function(_McpConnectionConfigDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto():
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
    TResult? Function(_McpConnectionConfigDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto() when $default != null:
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
      String transportType,
      String? command,
      List<String> args,
      Map<String, String>? env,
      String? url,
      Map<String, String>? headers,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto() when $default != null:
        return $default(
          _that.transportType,
          _that.command,
          _that.args,
          _that.env,
          _that.url,
          _that.headers,
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
      String transportType,
      String? command,
      List<String> args,
      Map<String, String>? env,
      String? url,
      Map<String, String>? headers,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto():
        return $default(
          _that.transportType,
          _that.command,
          _that.args,
          _that.env,
          _that.url,
          _that.headers,
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
      String transportType,
      String? command,
      List<String> args,
      Map<String, String>? env,
      String? url,
      Map<String, String>? headers,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpConnectionConfigDto() when $default != null:
        return $default(
          _that.transportType,
          _that.command,
          _that.args,
          _that.env,
          _that.url,
          _that.headers,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpConnectionConfigDto implements McpConnectionConfigDto {
  const _McpConnectionConfigDto({
    this.transportType = 'stdio',
    this.command,
    final List<String> args = const <String>[],
    final Map<String, String>? env,
    this.url,
    final Map<String, String>? headers,
  }) : _args = args,
       _env = env,
       _headers = headers;
  factory _McpConnectionConfigDto.fromJson(Map<String, dynamic> json) =>
      _$McpConnectionConfigDtoFromJson(json);

  @override
  @JsonKey()
  final String transportType;
  @override
  final String? command;
  final List<String> _args;
  @override
  @JsonKey()
  List<String> get args {
    if (_args is EqualUnmodifiableListView) return _args;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_args);
  }

  final Map<String, String>? _env;
  @override
  Map<String, String>? get env {
    final value = _env;
    if (value == null) return null;
    if (_env is EqualUnmodifiableMapView) return _env;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final String? url;
  final Map<String, String>? _headers;
  @override
  Map<String, String>? get headers {
    final value = _headers;
    if (value == null) return null;
    if (_headers is EqualUnmodifiableMapView) return _headers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  /// Create a copy of McpConnectionConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpConnectionConfigDtoCopyWith<_McpConnectionConfigDto> get copyWith =>
      __$McpConnectionConfigDtoCopyWithImpl<_McpConnectionConfigDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$McpConnectionConfigDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpConnectionConfigDto &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.command, command) || other.command == command) &&
            const DeepCollectionEquality().equals(other._args, _args) &&
            const DeepCollectionEquality().equals(other._env, _env) &&
            (identical(other.url, url) || other.url == url) &&
            const DeepCollectionEquality().equals(other._headers, _headers));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    transportType,
    command,
    const DeepCollectionEquality().hash(_args),
    const DeepCollectionEquality().hash(_env),
    url,
    const DeepCollectionEquality().hash(_headers),
  );

  @override
  String toString() {
    return 'McpConnectionConfigDto(transportType: $transportType, command: $command, args: $args, env: $env, url: $url, headers: $headers)';
  }
}

/// @nodoc
abstract mixin class _$McpConnectionConfigDtoCopyWith<$Res>
    implements $McpConnectionConfigDtoCopyWith<$Res> {
  factory _$McpConnectionConfigDtoCopyWith(
    _McpConnectionConfigDto value,
    $Res Function(_McpConnectionConfigDto) _then,
  ) = __$McpConnectionConfigDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String transportType,
    String? command,
    List<String> args,
    Map<String, String>? env,
    String? url,
    Map<String, String>? headers,
  });
}

/// @nodoc
class __$McpConnectionConfigDtoCopyWithImpl<$Res>
    implements _$McpConnectionConfigDtoCopyWith<$Res> {
  __$McpConnectionConfigDtoCopyWithImpl(this._self, this._then);

  final _McpConnectionConfigDto _self;
  final $Res Function(_McpConnectionConfigDto) _then;

  /// Create a copy of McpConnectionConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? transportType = null,
    Object? command = freezed,
    Object? args = null,
    Object? env = freezed,
    Object? url = freezed,
    Object? headers = freezed,
  }) {
    return _then(
      _McpConnectionConfigDto(
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        command: freezed == command
            ? _self.command
            : command // ignore: cast_nullable_to_non_nullable
                  as String?,
        args: null == args
            ? _self._args
            : args // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        env: freezed == env
            ? _self._env
            : env // ignore: cast_nullable_to_non_nullable
                  as Map<String, String>?,
        url: freezed == url
            ? _self.url
            : url // ignore: cast_nullable_to_non_nullable
                  as String?,
        headers: freezed == headers
            ? _self._headers
            : headers // ignore: cast_nullable_to_non_nullable
                  as Map<String, String>?,
      ),
    );
  }
}

/// @nodoc
mixin _$McpServerInfoDto {
  String get name;
  String get version;
  String? get protocolVersion;

  /// Create a copy of McpServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpServerInfoDtoCopyWith<McpServerInfoDto> get copyWith =>
      _$McpServerInfoDtoCopyWithImpl<McpServerInfoDto>(
        this as McpServerInfoDto,
        _$identity,
      );

  /// Serializes this McpServerInfoDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpServerInfoDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.protocolVersion, protocolVersion) ||
                other.protocolVersion == protocolVersion));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, name, version, protocolVersion);

  @override
  String toString() {
    return 'McpServerInfoDto(name: $name, version: $version, protocolVersion: $protocolVersion)';
  }
}

/// @nodoc
abstract mixin class $McpServerInfoDtoCopyWith<$Res> {
  factory $McpServerInfoDtoCopyWith(
    McpServerInfoDto value,
    $Res Function(McpServerInfoDto) _then,
  ) = _$McpServerInfoDtoCopyWithImpl;
  @useResult
  $Res call({String name, String version, String? protocolVersion});
}

/// @nodoc
class _$McpServerInfoDtoCopyWithImpl<$Res>
    implements $McpServerInfoDtoCopyWith<$Res> {
  _$McpServerInfoDtoCopyWithImpl(this._self, this._then);

  final McpServerInfoDto _self;
  final $Res Function(McpServerInfoDto) _then;

  /// Create a copy of McpServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? name = null,
    Object? version = null,
    Object? protocolVersion = freezed,
  }) {
    return _then(
      _self.copyWith(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as String,
        protocolVersion: freezed == protocolVersion
            ? _self.protocolVersion
            : protocolVersion // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [McpServerInfoDto].
extension McpServerInfoDtoPatterns on McpServerInfoDto {
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
    TResult Function(_McpServerInfoDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto() when $default != null:
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
    TResult Function(_McpServerInfoDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto():
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
    TResult? Function(_McpServerInfoDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto() when $default != null:
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
    TResult Function(String name, String version, String? protocolVersion)?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto() when $default != null:
        return $default(_that.name, _that.version, _that.protocolVersion);
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
    TResult Function(String name, String version, String? protocolVersion)
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto():
        return $default(_that.name, _that.version, _that.protocolVersion);
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
    TResult? Function(String name, String version, String? protocolVersion)?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerInfoDto() when $default != null:
        return $default(_that.name, _that.version, _that.protocolVersion);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpServerInfoDto implements McpServerInfoDto {
  const _McpServerInfoDto({
    required this.name,
    required this.version,
    this.protocolVersion,
  });
  factory _McpServerInfoDto.fromJson(Map<String, dynamic> json) =>
      _$McpServerInfoDtoFromJson(json);

  @override
  final String name;
  @override
  final String version;
  @override
  final String? protocolVersion;

  /// Create a copy of McpServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpServerInfoDtoCopyWith<_McpServerInfoDto> get copyWith =>
      __$McpServerInfoDtoCopyWithImpl<_McpServerInfoDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$McpServerInfoDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpServerInfoDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.protocolVersion, protocolVersion) ||
                other.protocolVersion == protocolVersion));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, name, version, protocolVersion);

  @override
  String toString() {
    return 'McpServerInfoDto(name: $name, version: $version, protocolVersion: $protocolVersion)';
  }
}

/// @nodoc
abstract mixin class _$McpServerInfoDtoCopyWith<$Res>
    implements $McpServerInfoDtoCopyWith<$Res> {
  factory _$McpServerInfoDtoCopyWith(
    _McpServerInfoDto value,
    $Res Function(_McpServerInfoDto) _then,
  ) = __$McpServerInfoDtoCopyWithImpl;
  @override
  @useResult
  $Res call({String name, String version, String? protocolVersion});
}

/// @nodoc
class __$McpServerInfoDtoCopyWithImpl<$Res>
    implements _$McpServerInfoDtoCopyWith<$Res> {
  __$McpServerInfoDtoCopyWithImpl(this._self, this._then);

  final _McpServerInfoDto _self;
  final $Res Function(_McpServerInfoDto) _then;

  /// Create a copy of McpServerInfoDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? name = null,
    Object? version = null,
    Object? protocolVersion = freezed,
  }) {
    return _then(
      _McpServerInfoDto(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        version: null == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as String,
        protocolVersion: freezed == protocolVersion
            ? _self.protocolVersion
            : protocolVersion // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$TestMcpConnectionResultDto {
  bool get success;
  McpServerInfoDto? get serverInfo;

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $TestMcpConnectionResultDtoCopyWith<TestMcpConnectionResultDto>
  get copyWith =>
      _$TestMcpConnectionResultDtoCopyWithImpl<TestMcpConnectionResultDto>(
        this as TestMcpConnectionResultDto,
        _$identity,
      );

  /// Serializes this TestMcpConnectionResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is TestMcpConnectionResultDto &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, success, serverInfo);

  @override
  String toString() {
    return 'TestMcpConnectionResultDto(success: $success, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class $TestMcpConnectionResultDtoCopyWith<$Res> {
  factory $TestMcpConnectionResultDtoCopyWith(
    TestMcpConnectionResultDto value,
    $Res Function(TestMcpConnectionResultDto) _then,
  ) = _$TestMcpConnectionResultDtoCopyWithImpl;
  @useResult
  $Res call({bool success, McpServerInfoDto? serverInfo});

  $McpServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class _$TestMcpConnectionResultDtoCopyWithImpl<$Res>
    implements $TestMcpConnectionResultDtoCopyWith<$Res> {
  _$TestMcpConnectionResultDtoCopyWithImpl(this._self, this._then);

  final TestMcpConnectionResultDto _self;
  final $Res Function(TestMcpConnectionResultDto) _then;

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? success = null, Object? serverInfo = freezed}) {
    return _then(
      _self.copyWith(
        success: null == success
            ? _self.success
            : success // ignore: cast_nullable_to_non_nullable
                  as bool,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as McpServerInfoDto?,
      ),
    );
  }

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $McpServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// Adds pattern-matching-related methods to [TestMcpConnectionResultDto].
extension TestMcpConnectionResultDtoPatterns on TestMcpConnectionResultDto {
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
    TResult Function(_TestMcpConnectionResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto() when $default != null:
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
    TResult Function(_TestMcpConnectionResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto():
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
    TResult? Function(_TestMcpConnectionResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto() when $default != null:
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
    TResult Function(bool success, McpServerInfoDto? serverInfo)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto() when $default != null:
        return $default(_that.success, _that.serverInfo);
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
    TResult Function(bool success, McpServerInfoDto? serverInfo) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto():
        return $default(_that.success, _that.serverInfo);
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
    TResult? Function(bool success, McpServerInfoDto? serverInfo)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TestMcpConnectionResultDto() when $default != null:
        return $default(_that.success, _that.serverInfo);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _TestMcpConnectionResultDto implements TestMcpConnectionResultDto {
  const _TestMcpConnectionResultDto({required this.success, this.serverInfo});
  factory _TestMcpConnectionResultDto.fromJson(Map<String, dynamic> json) =>
      _$TestMcpConnectionResultDtoFromJson(json);

  @override
  final bool success;
  @override
  final McpServerInfoDto? serverInfo;

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$TestMcpConnectionResultDtoCopyWith<_TestMcpConnectionResultDto>
  get copyWith =>
      __$TestMcpConnectionResultDtoCopyWithImpl<_TestMcpConnectionResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$TestMcpConnectionResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _TestMcpConnectionResultDto &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, success, serverInfo);

  @override
  String toString() {
    return 'TestMcpConnectionResultDto(success: $success, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class _$TestMcpConnectionResultDtoCopyWith<$Res>
    implements $TestMcpConnectionResultDtoCopyWith<$Res> {
  factory _$TestMcpConnectionResultDtoCopyWith(
    _TestMcpConnectionResultDto value,
    $Res Function(_TestMcpConnectionResultDto) _then,
  ) = __$TestMcpConnectionResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({bool success, McpServerInfoDto? serverInfo});

  @override
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class __$TestMcpConnectionResultDtoCopyWithImpl<$Res>
    implements _$TestMcpConnectionResultDtoCopyWith<$Res> {
  __$TestMcpConnectionResultDtoCopyWithImpl(this._self, this._then);

  final _TestMcpConnectionResultDto _self;
  final $Res Function(_TestMcpConnectionResultDto) _then;

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({Object? success = null, Object? serverInfo = freezed}) {
    return _then(
      _TestMcpConnectionResultDto(
        success: null == success
            ? _self.success
            : success // ignore: cast_nullable_to_non_nullable
                  as bool,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as McpServerInfoDto?,
      ),
    );
  }

  /// Create a copy of TestMcpConnectionResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $McpServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// @nodoc
mixin _$DiscoveredMcpToolDto {
  String get name;
  String? get title;
  String? get description;
  Map<String, dynamic>? get inputSchema;
  Map<String, dynamic>? get annotations;

  /// Create a copy of DiscoveredMcpToolDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $DiscoveredMcpToolDtoCopyWith<DiscoveredMcpToolDto> get copyWith =>
      _$DiscoveredMcpToolDtoCopyWithImpl<DiscoveredMcpToolDto>(
        this as DiscoveredMcpToolDto,
        _$identity,
      );

  /// Serializes this DiscoveredMcpToolDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is DiscoveredMcpToolDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other.inputSchema,
              inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other.annotations,
              annotations,
            ));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    name,
    title,
    description,
    const DeepCollectionEquality().hash(inputSchema),
    const DeepCollectionEquality().hash(annotations),
  );

  @override
  String toString() {
    return 'DiscoveredMcpToolDto(name: $name, title: $title, description: $description, inputSchema: $inputSchema, annotations: $annotations)';
  }
}

/// @nodoc
abstract mixin class $DiscoveredMcpToolDtoCopyWith<$Res> {
  factory $DiscoveredMcpToolDtoCopyWith(
    DiscoveredMcpToolDto value,
    $Res Function(DiscoveredMcpToolDto) _then,
  ) = _$DiscoveredMcpToolDtoCopyWithImpl;
  @useResult
  $Res call({
    String name,
    String? title,
    String? description,
    Map<String, dynamic>? inputSchema,
    Map<String, dynamic>? annotations,
  });
}

/// @nodoc
class _$DiscoveredMcpToolDtoCopyWithImpl<$Res>
    implements $DiscoveredMcpToolDtoCopyWith<$Res> {
  _$DiscoveredMcpToolDtoCopyWithImpl(this._self, this._then);

  final DiscoveredMcpToolDto _self;
  final $Res Function(DiscoveredMcpToolDto) _then;

  /// Create a copy of DiscoveredMcpToolDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? name = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? inputSchema = freezed,
    Object? annotations = freezed,
  }) {
    return _then(
      _self.copyWith(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self.inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        annotations: freezed == annotations
            ? _self.annotations
            : annotations // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [DiscoveredMcpToolDto].
extension DiscoveredMcpToolDtoPatterns on DiscoveredMcpToolDto {
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
    TResult Function(_DiscoveredMcpToolDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto() when $default != null:
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
    TResult Function(_DiscoveredMcpToolDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto():
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
    TResult? Function(_DiscoveredMcpToolDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto() when $default != null:
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
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? annotations,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto() when $default != null:
        return $default(
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.annotations,
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
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? annotations,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto():
        return $default(
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.annotations,
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
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? annotations,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoveredMcpToolDto() when $default != null:
        return $default(
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.annotations,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _DiscoveredMcpToolDto implements DiscoveredMcpToolDto {
  const _DiscoveredMcpToolDto({
    required this.name,
    this.title,
    this.description,
    final Map<String, dynamic>? inputSchema,
    final Map<String, dynamic>? annotations,
  }) : _inputSchema = inputSchema,
       _annotations = annotations;
  factory _DiscoveredMcpToolDto.fromJson(Map<String, dynamic> json) =>
      _$DiscoveredMcpToolDtoFromJson(json);

  @override
  final String name;
  @override
  final String? title;
  @override
  final String? description;
  final Map<String, dynamic>? _inputSchema;
  @override
  Map<String, dynamic>? get inputSchema {
    final value = _inputSchema;
    if (value == null) return null;
    if (_inputSchema is EqualUnmodifiableMapView) return _inputSchema;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final Map<String, dynamic>? _annotations;
  @override
  Map<String, dynamic>? get annotations {
    final value = _annotations;
    if (value == null) return null;
    if (_annotations is EqualUnmodifiableMapView) return _annotations;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  /// Create a copy of DiscoveredMcpToolDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$DiscoveredMcpToolDtoCopyWith<_DiscoveredMcpToolDto> get copyWith =>
      __$DiscoveredMcpToolDtoCopyWithImpl<_DiscoveredMcpToolDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$DiscoveredMcpToolDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _DiscoveredMcpToolDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other._inputSchema,
              _inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other._annotations,
              _annotations,
            ));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    name,
    title,
    description,
    const DeepCollectionEquality().hash(_inputSchema),
    const DeepCollectionEquality().hash(_annotations),
  );

  @override
  String toString() {
    return 'DiscoveredMcpToolDto(name: $name, title: $title, description: $description, inputSchema: $inputSchema, annotations: $annotations)';
  }
}

/// @nodoc
abstract mixin class _$DiscoveredMcpToolDtoCopyWith<$Res>
    implements $DiscoveredMcpToolDtoCopyWith<$Res> {
  factory _$DiscoveredMcpToolDtoCopyWith(
    _DiscoveredMcpToolDto value,
    $Res Function(_DiscoveredMcpToolDto) _then,
  ) = __$DiscoveredMcpToolDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String name,
    String? title,
    String? description,
    Map<String, dynamic>? inputSchema,
    Map<String, dynamic>? annotations,
  });
}

/// @nodoc
class __$DiscoveredMcpToolDtoCopyWithImpl<$Res>
    implements _$DiscoveredMcpToolDtoCopyWith<$Res> {
  __$DiscoveredMcpToolDtoCopyWithImpl(this._self, this._then);

  final _DiscoveredMcpToolDto _self;
  final $Res Function(_DiscoveredMcpToolDto) _then;

  /// Create a copy of DiscoveredMcpToolDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? name = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? inputSchema = freezed,
    Object? annotations = freezed,
  }) {
    return _then(
      _DiscoveredMcpToolDto(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self._inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        annotations: freezed == annotations
            ? _self._annotations
            : annotations // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
      ),
    );
  }
}

/// @nodoc
mixin _$DiscoverMcpToolsResultDto {
  List<DiscoveredMcpToolDto> get tools;
  McpServerInfoDto? get serverInfo;

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $DiscoverMcpToolsResultDtoCopyWith<DiscoverMcpToolsResultDto> get copyWith =>
      _$DiscoverMcpToolsResultDtoCopyWithImpl<DiscoverMcpToolsResultDto>(
        this as DiscoverMcpToolsResultDto,
        _$identity,
      );

  /// Serializes this DiscoverMcpToolsResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is DiscoverMcpToolsResultDto &&
            const DeepCollectionEquality().equals(other.tools, tools) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(tools),
    serverInfo,
  );

  @override
  String toString() {
    return 'DiscoverMcpToolsResultDto(tools: $tools, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class $DiscoverMcpToolsResultDtoCopyWith<$Res> {
  factory $DiscoverMcpToolsResultDtoCopyWith(
    DiscoverMcpToolsResultDto value,
    $Res Function(DiscoverMcpToolsResultDto) _then,
  ) = _$DiscoverMcpToolsResultDtoCopyWithImpl;
  @useResult
  $Res call({List<DiscoveredMcpToolDto> tools, McpServerInfoDto? serverInfo});

  $McpServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class _$DiscoverMcpToolsResultDtoCopyWithImpl<$Res>
    implements $DiscoverMcpToolsResultDtoCopyWith<$Res> {
  _$DiscoverMcpToolsResultDtoCopyWithImpl(this._self, this._then);

  final DiscoverMcpToolsResultDto _self;
  final $Res Function(DiscoverMcpToolsResultDto) _then;

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? tools = null, Object? serverInfo = freezed}) {
    return _then(
      _self.copyWith(
        tools: null == tools
            ? _self.tools
            : tools // ignore: cast_nullable_to_non_nullable
                  as List<DiscoveredMcpToolDto>,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as McpServerInfoDto?,
      ),
    );
  }

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $McpServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// Adds pattern-matching-related methods to [DiscoverMcpToolsResultDto].
extension DiscoverMcpToolsResultDtoPatterns on DiscoverMcpToolsResultDto {
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
    TResult Function(_DiscoverMcpToolsResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto() when $default != null:
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
    TResult Function(_DiscoverMcpToolsResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto():
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
    TResult? Function(_DiscoverMcpToolsResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto() when $default != null:
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
      List<DiscoveredMcpToolDto> tools,
      McpServerInfoDto? serverInfo,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto() when $default != null:
        return $default(_that.tools, _that.serverInfo);
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
      List<DiscoveredMcpToolDto> tools,
      McpServerInfoDto? serverInfo,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto():
        return $default(_that.tools, _that.serverInfo);
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
      List<DiscoveredMcpToolDto> tools,
      McpServerInfoDto? serverInfo,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _DiscoverMcpToolsResultDto() when $default != null:
        return $default(_that.tools, _that.serverInfo);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _DiscoverMcpToolsResultDto implements DiscoverMcpToolsResultDto {
  const _DiscoverMcpToolsResultDto({
    final List<DiscoveredMcpToolDto> tools = const <DiscoveredMcpToolDto>[],
    this.serverInfo,
  }) : _tools = tools;
  factory _DiscoverMcpToolsResultDto.fromJson(Map<String, dynamic> json) =>
      _$DiscoverMcpToolsResultDtoFromJson(json);

  final List<DiscoveredMcpToolDto> _tools;
  @override
  @JsonKey()
  List<DiscoveredMcpToolDto> get tools {
    if (_tools is EqualUnmodifiableListView) return _tools;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_tools);
  }

  @override
  final McpServerInfoDto? serverInfo;

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$DiscoverMcpToolsResultDtoCopyWith<_DiscoverMcpToolsResultDto>
  get copyWith =>
      __$DiscoverMcpToolsResultDtoCopyWithImpl<_DiscoverMcpToolsResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$DiscoverMcpToolsResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _DiscoverMcpToolsResultDto &&
            const DeepCollectionEquality().equals(other._tools, _tools) &&
            (identical(other.serverInfo, serverInfo) ||
                other.serverInfo == serverInfo));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(_tools),
    serverInfo,
  );

  @override
  String toString() {
    return 'DiscoverMcpToolsResultDto(tools: $tools, serverInfo: $serverInfo)';
  }
}

/// @nodoc
abstract mixin class _$DiscoverMcpToolsResultDtoCopyWith<$Res>
    implements $DiscoverMcpToolsResultDtoCopyWith<$Res> {
  factory _$DiscoverMcpToolsResultDtoCopyWith(
    _DiscoverMcpToolsResultDto value,
    $Res Function(_DiscoverMcpToolsResultDto) _then,
  ) = __$DiscoverMcpToolsResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({List<DiscoveredMcpToolDto> tools, McpServerInfoDto? serverInfo});

  @override
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo;
}

/// @nodoc
class __$DiscoverMcpToolsResultDtoCopyWithImpl<$Res>
    implements _$DiscoverMcpToolsResultDtoCopyWith<$Res> {
  __$DiscoverMcpToolsResultDtoCopyWithImpl(this._self, this._then);

  final _DiscoverMcpToolsResultDto _self;
  final $Res Function(_DiscoverMcpToolsResultDto) _then;

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({Object? tools = null, Object? serverInfo = freezed}) {
    return _then(
      _DiscoverMcpToolsResultDto(
        tools: null == tools
            ? _self._tools
            : tools // ignore: cast_nullable_to_non_nullable
                  as List<DiscoveredMcpToolDto>,
        serverInfo: freezed == serverInfo
            ? _self.serverInfo
            : serverInfo // ignore: cast_nullable_to_non_nullable
                  as McpServerInfoDto?,
      ),
    );
  }

  /// Create a copy of DiscoverMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpServerInfoDtoCopyWith<$Res>? get serverInfo {
    if (_self.serverInfo == null) {
      return null;
    }

    return $McpServerInfoDtoCopyWith<$Res>(_self.serverInfo!, (value) {
      return _then(_self.copyWith(serverInfo: value));
    });
  }
}

/// @nodoc
mixin _$McpPortMappingDto {
  String get name;
  String get dataType;
  String? get description;
  bool get required;

  /// Create a copy of McpPortMappingDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpPortMappingDtoCopyWith<McpPortMappingDto> get copyWith =>
      _$McpPortMappingDtoCopyWithImpl<McpPortMappingDto>(
        this as McpPortMappingDto,
        _$identity,
      );

  /// Serializes this McpPortMappingDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpPortMappingDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.dataType, dataType) ||
                other.dataType == dataType) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.required, required) ||
                other.required == required));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, name, dataType, description, required);

  @override
  String toString() {
    return 'McpPortMappingDto(name: $name, dataType: $dataType, description: $description, required: $required)';
  }
}

/// @nodoc
abstract mixin class $McpPortMappingDtoCopyWith<$Res> {
  factory $McpPortMappingDtoCopyWith(
    McpPortMappingDto value,
    $Res Function(McpPortMappingDto) _then,
  ) = _$McpPortMappingDtoCopyWithImpl;
  @useResult
  $Res call({String name, String dataType, String? description, bool required});
}

/// @nodoc
class _$McpPortMappingDtoCopyWithImpl<$Res>
    implements $McpPortMappingDtoCopyWith<$Res> {
  _$McpPortMappingDtoCopyWithImpl(this._self, this._then);

  final McpPortMappingDto _self;
  final $Res Function(McpPortMappingDto) _then;

  /// Create a copy of McpPortMappingDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? name = null,
    Object? dataType = null,
    Object? description = freezed,
    Object? required = null,
  }) {
    return _then(
      _self.copyWith(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        dataType: null == dataType
            ? _self.dataType
            : dataType // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        required: null == required
            ? _self.required
            : required // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [McpPortMappingDto].
extension McpPortMappingDtoPatterns on McpPortMappingDto {
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
    TResult Function(_McpPortMappingDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto() when $default != null:
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
    TResult Function(_McpPortMappingDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto():
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
    TResult? Function(_McpPortMappingDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto() when $default != null:
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
      String name,
      String dataType,
      String? description,
      bool required,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto() when $default != null:
        return $default(
          _that.name,
          _that.dataType,
          _that.description,
          _that.required,
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
      String name,
      String dataType,
      String? description,
      bool required,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto():
        return $default(
          _that.name,
          _that.dataType,
          _that.description,
          _that.required,
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
      String name,
      String dataType,
      String? description,
      bool required,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingDto() when $default != null:
        return $default(
          _that.name,
          _that.dataType,
          _that.description,
          _that.required,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpPortMappingDto implements McpPortMappingDto {
  const _McpPortMappingDto({
    required this.name,
    this.dataType = 'json',
    this.description,
    this.required = false,
  });
  factory _McpPortMappingDto.fromJson(Map<String, dynamic> json) =>
      _$McpPortMappingDtoFromJson(json);

  @override
  final String name;
  @override
  @JsonKey()
  final String dataType;
  @override
  final String? description;
  @override
  @JsonKey()
  final bool required;

  /// Create a copy of McpPortMappingDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpPortMappingDtoCopyWith<_McpPortMappingDto> get copyWith =>
      __$McpPortMappingDtoCopyWithImpl<_McpPortMappingDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$McpPortMappingDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpPortMappingDto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.dataType, dataType) ||
                other.dataType == dataType) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.required, required) ||
                other.required == required));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, name, dataType, description, required);

  @override
  String toString() {
    return 'McpPortMappingDto(name: $name, dataType: $dataType, description: $description, required: $required)';
  }
}

/// @nodoc
abstract mixin class _$McpPortMappingDtoCopyWith<$Res>
    implements $McpPortMappingDtoCopyWith<$Res> {
  factory _$McpPortMappingDtoCopyWith(
    _McpPortMappingDto value,
    $Res Function(_McpPortMappingDto) _then,
  ) = __$McpPortMappingDtoCopyWithImpl;
  @override
  @useResult
  $Res call({String name, String dataType, String? description, bool required});
}

/// @nodoc
class __$McpPortMappingDtoCopyWithImpl<$Res>
    implements _$McpPortMappingDtoCopyWith<$Res> {
  __$McpPortMappingDtoCopyWithImpl(this._self, this._then);

  final _McpPortMappingDto _self;
  final $Res Function(_McpPortMappingDto) _then;

  /// Create a copy of McpPortMappingDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? name = null,
    Object? dataType = null,
    Object? description = freezed,
    Object? required = null,
  }) {
    return _then(
      _McpPortMappingDto(
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        dataType: null == dataType
            ? _self.dataType
            : dataType // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        required: null == required
            ? _self.required
            : required // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// @nodoc
mixin _$McpPortMappingMetadataDto {
  List<McpPortMappingDto> get inputs;
  List<McpPortMappingDto> get outputs;

  /// Create a copy of McpPortMappingMetadataDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpPortMappingMetadataDtoCopyWith<McpPortMappingMetadataDto> get copyWith =>
      _$McpPortMappingMetadataDtoCopyWithImpl<McpPortMappingMetadataDto>(
        this as McpPortMappingMetadataDto,
        _$identity,
      );

  /// Serializes this McpPortMappingMetadataDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpPortMappingMetadataDto &&
            const DeepCollectionEquality().equals(other.inputs, inputs) &&
            const DeepCollectionEquality().equals(other.outputs, outputs));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(inputs),
    const DeepCollectionEquality().hash(outputs),
  );

  @override
  String toString() {
    return 'McpPortMappingMetadataDto(inputs: $inputs, outputs: $outputs)';
  }
}

/// @nodoc
abstract mixin class $McpPortMappingMetadataDtoCopyWith<$Res> {
  factory $McpPortMappingMetadataDtoCopyWith(
    McpPortMappingMetadataDto value,
    $Res Function(McpPortMappingMetadataDto) _then,
  ) = _$McpPortMappingMetadataDtoCopyWithImpl;
  @useResult
  $Res call({List<McpPortMappingDto> inputs, List<McpPortMappingDto> outputs});
}

/// @nodoc
class _$McpPortMappingMetadataDtoCopyWithImpl<$Res>
    implements $McpPortMappingMetadataDtoCopyWith<$Res> {
  _$McpPortMappingMetadataDtoCopyWithImpl(this._self, this._then);

  final McpPortMappingMetadataDto _self;
  final $Res Function(McpPortMappingMetadataDto) _then;

  /// Create a copy of McpPortMappingMetadataDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? inputs = null, Object? outputs = null}) {
    return _then(
      _self.copyWith(
        inputs: null == inputs
            ? _self.inputs
            : inputs // ignore: cast_nullable_to_non_nullable
                  as List<McpPortMappingDto>,
        outputs: null == outputs
            ? _self.outputs
            : outputs // ignore: cast_nullable_to_non_nullable
                  as List<McpPortMappingDto>,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [McpPortMappingMetadataDto].
extension McpPortMappingMetadataDtoPatterns on McpPortMappingMetadataDto {
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
    TResult Function(_McpPortMappingMetadataDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto() when $default != null:
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
    TResult Function(_McpPortMappingMetadataDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto():
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
    TResult? Function(_McpPortMappingMetadataDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto() when $default != null:
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
      List<McpPortMappingDto> inputs,
      List<McpPortMappingDto> outputs,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto() when $default != null:
        return $default(_that.inputs, _that.outputs);
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
      List<McpPortMappingDto> inputs,
      List<McpPortMappingDto> outputs,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto():
        return $default(_that.inputs, _that.outputs);
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
      List<McpPortMappingDto> inputs,
      List<McpPortMappingDto> outputs,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpPortMappingMetadataDto() when $default != null:
        return $default(_that.inputs, _that.outputs);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpPortMappingMetadataDto implements McpPortMappingMetadataDto {
  const _McpPortMappingMetadataDto({
    final List<McpPortMappingDto> inputs = const <McpPortMappingDto>[],
    final List<McpPortMappingDto> outputs = const <McpPortMappingDto>[],
  }) : _inputs = inputs,
       _outputs = outputs;
  factory _McpPortMappingMetadataDto.fromJson(Map<String, dynamic> json) =>
      _$McpPortMappingMetadataDtoFromJson(json);

  final List<McpPortMappingDto> _inputs;
  @override
  @JsonKey()
  List<McpPortMappingDto> get inputs {
    if (_inputs is EqualUnmodifiableListView) return _inputs;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_inputs);
  }

  final List<McpPortMappingDto> _outputs;
  @override
  @JsonKey()
  List<McpPortMappingDto> get outputs {
    if (_outputs is EqualUnmodifiableListView) return _outputs;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_outputs);
  }

  /// Create a copy of McpPortMappingMetadataDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpPortMappingMetadataDtoCopyWith<_McpPortMappingMetadataDto>
  get copyWith =>
      __$McpPortMappingMetadataDtoCopyWithImpl<_McpPortMappingMetadataDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$McpPortMappingMetadataDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpPortMappingMetadataDto &&
            const DeepCollectionEquality().equals(other._inputs, _inputs) &&
            const DeepCollectionEquality().equals(other._outputs, _outputs));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    const DeepCollectionEquality().hash(_inputs),
    const DeepCollectionEquality().hash(_outputs),
  );

  @override
  String toString() {
    return 'McpPortMappingMetadataDto(inputs: $inputs, outputs: $outputs)';
  }
}

/// @nodoc
abstract mixin class _$McpPortMappingMetadataDtoCopyWith<$Res>
    implements $McpPortMappingMetadataDtoCopyWith<$Res> {
  factory _$McpPortMappingMetadataDtoCopyWith(
    _McpPortMappingMetadataDto value,
    $Res Function(_McpPortMappingMetadataDto) _then,
  ) = __$McpPortMappingMetadataDtoCopyWithImpl;
  @override
  @useResult
  $Res call({List<McpPortMappingDto> inputs, List<McpPortMappingDto> outputs});
}

/// @nodoc
class __$McpPortMappingMetadataDtoCopyWithImpl<$Res>
    implements _$McpPortMappingMetadataDtoCopyWith<$Res> {
  __$McpPortMappingMetadataDtoCopyWithImpl(this._self, this._then);

  final _McpPortMappingMetadataDto _self;
  final $Res Function(_McpPortMappingMetadataDto) _then;

  /// Create a copy of McpPortMappingMetadataDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({Object? inputs = null, Object? outputs = null}) {
    return _then(
      _McpPortMappingMetadataDto(
        inputs: null == inputs
            ? _self._inputs
            : inputs // ignore: cast_nullable_to_non_nullable
                  as List<McpPortMappingDto>,
        outputs: null == outputs
            ? _self._outputs
            : outputs // ignore: cast_nullable_to_non_nullable
                  as List<McpPortMappingDto>,
      ),
    );
  }
}

/// @nodoc
mixin _$ImportedToolResultDto {
  String? get toolDefinitionId;
  String get toolName;
  String get status;
  String? get title;
  String? get description;
  McpPortMappingMetadataDto? get portMappingMetadata;
  String? get reasonCode;
  String? get reasonMessage;

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ImportedToolResultDtoCopyWith<ImportedToolResultDto> get copyWith =>
      _$ImportedToolResultDtoCopyWithImpl<ImportedToolResultDto>(
        this as ImportedToolResultDto,
        _$identity,
      );

  /// Serializes this ImportedToolResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ImportedToolResultDto &&
            (identical(other.toolDefinitionId, toolDefinitionId) ||
                other.toolDefinitionId == toolDefinitionId) &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.portMappingMetadata, portMappingMetadata) ||
                other.portMappingMetadata == portMappingMetadata) &&
            (identical(other.reasonCode, reasonCode) ||
                other.reasonCode == reasonCode) &&
            (identical(other.reasonMessage, reasonMessage) ||
                other.reasonMessage == reasonMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolDefinitionId,
    toolName,
    status,
    title,
    description,
    portMappingMetadata,
    reasonCode,
    reasonMessage,
  );

  @override
  String toString() {
    return 'ImportedToolResultDto(toolDefinitionId: $toolDefinitionId, toolName: $toolName, status: $status, title: $title, description: $description, portMappingMetadata: $portMappingMetadata, reasonCode: $reasonCode, reasonMessage: $reasonMessage)';
  }
}

/// @nodoc
abstract mixin class $ImportedToolResultDtoCopyWith<$Res> {
  factory $ImportedToolResultDtoCopyWith(
    ImportedToolResultDto value,
    $Res Function(ImportedToolResultDto) _then,
  ) = _$ImportedToolResultDtoCopyWithImpl;
  @useResult
  $Res call({
    String? toolDefinitionId,
    String toolName,
    String status,
    String? title,
    String? description,
    McpPortMappingMetadataDto? portMappingMetadata,
    String? reasonCode,
    String? reasonMessage,
  });

  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata;
}

/// @nodoc
class _$ImportedToolResultDtoCopyWithImpl<$Res>
    implements $ImportedToolResultDtoCopyWith<$Res> {
  _$ImportedToolResultDtoCopyWithImpl(this._self, this._then);

  final ImportedToolResultDto _self;
  final $Res Function(ImportedToolResultDto) _then;

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? toolDefinitionId = freezed,
    Object? toolName = null,
    Object? status = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? portMappingMetadata = freezed,
    Object? reasonCode = freezed,
    Object? reasonMessage = freezed,
  }) {
    return _then(
      _self.copyWith(
        toolDefinitionId: freezed == toolDefinitionId
            ? _self.toolDefinitionId
            : toolDefinitionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        toolName: null == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        portMappingMetadata: freezed == portMappingMetadata
            ? _self.portMappingMetadata
            : portMappingMetadata // ignore: cast_nullable_to_non_nullable
                  as McpPortMappingMetadataDto?,
        reasonCode: freezed == reasonCode
            ? _self.reasonCode
            : reasonCode // ignore: cast_nullable_to_non_nullable
                  as String?,
        reasonMessage: freezed == reasonMessage
            ? _self.reasonMessage
            : reasonMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata {
    if (_self.portMappingMetadata == null) {
      return null;
    }

    return $McpPortMappingMetadataDtoCopyWith<$Res>(
      _self.portMappingMetadata!,
      (value) {
        return _then(_self.copyWith(portMappingMetadata: value));
      },
    );
  }
}

/// Adds pattern-matching-related methods to [ImportedToolResultDto].
extension ImportedToolResultDtoPatterns on ImportedToolResultDto {
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
    TResult Function(_ImportedToolResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto() when $default != null:
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
    TResult Function(_ImportedToolResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto():
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
    TResult? Function(_ImportedToolResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto() when $default != null:
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
      String? toolDefinitionId,
      String toolName,
      String status,
      String? title,
      String? description,
      McpPortMappingMetadataDto? portMappingMetadata,
      String? reasonCode,
      String? reasonMessage,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto() when $default != null:
        return $default(
          _that.toolDefinitionId,
          _that.toolName,
          _that.status,
          _that.title,
          _that.description,
          _that.portMappingMetadata,
          _that.reasonCode,
          _that.reasonMessage,
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
      String? toolDefinitionId,
      String toolName,
      String status,
      String? title,
      String? description,
      McpPortMappingMetadataDto? portMappingMetadata,
      String? reasonCode,
      String? reasonMessage,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto():
        return $default(
          _that.toolDefinitionId,
          _that.toolName,
          _that.status,
          _that.title,
          _that.description,
          _that.portMappingMetadata,
          _that.reasonCode,
          _that.reasonMessage,
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
      String? toolDefinitionId,
      String toolName,
      String status,
      String? title,
      String? description,
      McpPortMappingMetadataDto? portMappingMetadata,
      String? reasonCode,
      String? reasonMessage,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportedToolResultDto() when $default != null:
        return $default(
          _that.toolDefinitionId,
          _that.toolName,
          _that.status,
          _that.title,
          _that.description,
          _that.portMappingMetadata,
          _that.reasonCode,
          _that.reasonMessage,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ImportedToolResultDto implements ImportedToolResultDto {
  const _ImportedToolResultDto({
    this.toolDefinitionId,
    required this.toolName,
    required this.status,
    this.title,
    this.description,
    this.portMappingMetadata,
    this.reasonCode,
    this.reasonMessage,
  });
  factory _ImportedToolResultDto.fromJson(Map<String, dynamic> json) =>
      _$ImportedToolResultDtoFromJson(json);

  @override
  final String? toolDefinitionId;
  @override
  final String toolName;
  @override
  final String status;
  @override
  final String? title;
  @override
  final String? description;
  @override
  final McpPortMappingMetadataDto? portMappingMetadata;
  @override
  final String? reasonCode;
  @override
  final String? reasonMessage;

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ImportedToolResultDtoCopyWith<_ImportedToolResultDto> get copyWith =>
      __$ImportedToolResultDtoCopyWithImpl<_ImportedToolResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ImportedToolResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ImportedToolResultDto &&
            (identical(other.toolDefinitionId, toolDefinitionId) ||
                other.toolDefinitionId == toolDefinitionId) &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.portMappingMetadata, portMappingMetadata) ||
                other.portMappingMetadata == portMappingMetadata) &&
            (identical(other.reasonCode, reasonCode) ||
                other.reasonCode == reasonCode) &&
            (identical(other.reasonMessage, reasonMessage) ||
                other.reasonMessage == reasonMessage));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolDefinitionId,
    toolName,
    status,
    title,
    description,
    portMappingMetadata,
    reasonCode,
    reasonMessage,
  );

  @override
  String toString() {
    return 'ImportedToolResultDto(toolDefinitionId: $toolDefinitionId, toolName: $toolName, status: $status, title: $title, description: $description, portMappingMetadata: $portMappingMetadata, reasonCode: $reasonCode, reasonMessage: $reasonMessage)';
  }
}

/// @nodoc
abstract mixin class _$ImportedToolResultDtoCopyWith<$Res>
    implements $ImportedToolResultDtoCopyWith<$Res> {
  factory _$ImportedToolResultDtoCopyWith(
    _ImportedToolResultDto value,
    $Res Function(_ImportedToolResultDto) _then,
  ) = __$ImportedToolResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String? toolDefinitionId,
    String toolName,
    String status,
    String? title,
    String? description,
    McpPortMappingMetadataDto? portMappingMetadata,
    String? reasonCode,
    String? reasonMessage,
  });

  @override
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata;
}

/// @nodoc
class __$ImportedToolResultDtoCopyWithImpl<$Res>
    implements _$ImportedToolResultDtoCopyWith<$Res> {
  __$ImportedToolResultDtoCopyWithImpl(this._self, this._then);

  final _ImportedToolResultDto _self;
  final $Res Function(_ImportedToolResultDto) _then;

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? toolDefinitionId = freezed,
    Object? toolName = null,
    Object? status = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? portMappingMetadata = freezed,
    Object? reasonCode = freezed,
    Object? reasonMessage = freezed,
  }) {
    return _then(
      _ImportedToolResultDto(
        toolDefinitionId: freezed == toolDefinitionId
            ? _self.toolDefinitionId
            : toolDefinitionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        toolName: null == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        portMappingMetadata: freezed == portMappingMetadata
            ? _self.portMappingMetadata
            : portMappingMetadata // ignore: cast_nullable_to_non_nullable
                  as McpPortMappingMetadataDto?,
        reasonCode: freezed == reasonCode
            ? _self.reasonCode
            : reasonCode // ignore: cast_nullable_to_non_nullable
                  as String?,
        reasonMessage: freezed == reasonMessage
            ? _self.reasonMessage
            : reasonMessage // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of ImportedToolResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata {
    if (_self.portMappingMetadata == null) {
      return null;
    }

    return $McpPortMappingMetadataDtoCopyWith<$Res>(
      _self.portMappingMetadata!,
      (value) {
        return _then(_self.copyWith(portMappingMetadata: value));
      },
    );
  }
}

/// @nodoc
mixin _$ImportMcpToolsSummaryDto {
  int get total;
  int get imported;
  int get overwritten;
  int get skipped;
  int get failed;

  /// Create a copy of ImportMcpToolsSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ImportMcpToolsSummaryDtoCopyWith<ImportMcpToolsSummaryDto> get copyWith =>
      _$ImportMcpToolsSummaryDtoCopyWithImpl<ImportMcpToolsSummaryDto>(
        this as ImportMcpToolsSummaryDto,
        _$identity,
      );

  /// Serializes this ImportMcpToolsSummaryDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ImportMcpToolsSummaryDto &&
            (identical(other.total, total) || other.total == total) &&
            (identical(other.imported, imported) ||
                other.imported == imported) &&
            (identical(other.overwritten, overwritten) ||
                other.overwritten == overwritten) &&
            (identical(other.skipped, skipped) || other.skipped == skipped) &&
            (identical(other.failed, failed) || other.failed == failed));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, total, imported, overwritten, skipped, failed);

  @override
  String toString() {
    return 'ImportMcpToolsSummaryDto(total: $total, imported: $imported, overwritten: $overwritten, skipped: $skipped, failed: $failed)';
  }
}

/// @nodoc
abstract mixin class $ImportMcpToolsSummaryDtoCopyWith<$Res> {
  factory $ImportMcpToolsSummaryDtoCopyWith(
    ImportMcpToolsSummaryDto value,
    $Res Function(ImportMcpToolsSummaryDto) _then,
  ) = _$ImportMcpToolsSummaryDtoCopyWithImpl;
  @useResult
  $Res call({
    int total,
    int imported,
    int overwritten,
    int skipped,
    int failed,
  });
}

/// @nodoc
class _$ImportMcpToolsSummaryDtoCopyWithImpl<$Res>
    implements $ImportMcpToolsSummaryDtoCopyWith<$Res> {
  _$ImportMcpToolsSummaryDtoCopyWithImpl(this._self, this._then);

  final ImportMcpToolsSummaryDto _self;
  final $Res Function(ImportMcpToolsSummaryDto) _then;

  /// Create a copy of ImportMcpToolsSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? total = null,
    Object? imported = null,
    Object? overwritten = null,
    Object? skipped = null,
    Object? failed = null,
  }) {
    return _then(
      _self.copyWith(
        total: null == total
            ? _self.total
            : total // ignore: cast_nullable_to_non_nullable
                  as int,
        imported: null == imported
            ? _self.imported
            : imported // ignore: cast_nullable_to_non_nullable
                  as int,
        overwritten: null == overwritten
            ? _self.overwritten
            : overwritten // ignore: cast_nullable_to_non_nullable
                  as int,
        skipped: null == skipped
            ? _self.skipped
            : skipped // ignore: cast_nullable_to_non_nullable
                  as int,
        failed: null == failed
            ? _self.failed
            : failed // ignore: cast_nullable_to_non_nullable
                  as int,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ImportMcpToolsSummaryDto].
extension ImportMcpToolsSummaryDtoPatterns on ImportMcpToolsSummaryDto {
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
    TResult Function(_ImportMcpToolsSummaryDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto() when $default != null:
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
    TResult Function(_ImportMcpToolsSummaryDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto():
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
    TResult? Function(_ImportMcpToolsSummaryDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto() when $default != null:
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
      int total,
      int imported,
      int overwritten,
      int skipped,
      int failed,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto() when $default != null:
        return $default(
          _that.total,
          _that.imported,
          _that.overwritten,
          _that.skipped,
          _that.failed,
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
      int total,
      int imported,
      int overwritten,
      int skipped,
      int failed,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto():
        return $default(
          _that.total,
          _that.imported,
          _that.overwritten,
          _that.skipped,
          _that.failed,
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
      int total,
      int imported,
      int overwritten,
      int skipped,
      int failed,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsSummaryDto() when $default != null:
        return $default(
          _that.total,
          _that.imported,
          _that.overwritten,
          _that.skipped,
          _that.failed,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ImportMcpToolsSummaryDto implements ImportMcpToolsSummaryDto {
  const _ImportMcpToolsSummaryDto({
    this.total = 0,
    this.imported = 0,
    this.overwritten = 0,
    this.skipped = 0,
    this.failed = 0,
  });
  factory _ImportMcpToolsSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$ImportMcpToolsSummaryDtoFromJson(json);

  @override
  @JsonKey()
  final int total;
  @override
  @JsonKey()
  final int imported;
  @override
  @JsonKey()
  final int overwritten;
  @override
  @JsonKey()
  final int skipped;
  @override
  @JsonKey()
  final int failed;

  /// Create a copy of ImportMcpToolsSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ImportMcpToolsSummaryDtoCopyWith<_ImportMcpToolsSummaryDto> get copyWith =>
      __$ImportMcpToolsSummaryDtoCopyWithImpl<_ImportMcpToolsSummaryDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ImportMcpToolsSummaryDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ImportMcpToolsSummaryDto &&
            (identical(other.total, total) || other.total == total) &&
            (identical(other.imported, imported) ||
                other.imported == imported) &&
            (identical(other.overwritten, overwritten) ||
                other.overwritten == overwritten) &&
            (identical(other.skipped, skipped) || other.skipped == skipped) &&
            (identical(other.failed, failed) || other.failed == failed));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, total, imported, overwritten, skipped, failed);

  @override
  String toString() {
    return 'ImportMcpToolsSummaryDto(total: $total, imported: $imported, overwritten: $overwritten, skipped: $skipped, failed: $failed)';
  }
}

/// @nodoc
abstract mixin class _$ImportMcpToolsSummaryDtoCopyWith<$Res>
    implements $ImportMcpToolsSummaryDtoCopyWith<$Res> {
  factory _$ImportMcpToolsSummaryDtoCopyWith(
    _ImportMcpToolsSummaryDto value,
    $Res Function(_ImportMcpToolsSummaryDto) _then,
  ) = __$ImportMcpToolsSummaryDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    int total,
    int imported,
    int overwritten,
    int skipped,
    int failed,
  });
}

/// @nodoc
class __$ImportMcpToolsSummaryDtoCopyWithImpl<$Res>
    implements _$ImportMcpToolsSummaryDtoCopyWith<$Res> {
  __$ImportMcpToolsSummaryDtoCopyWithImpl(this._self, this._then);

  final _ImportMcpToolsSummaryDto _self;
  final $Res Function(_ImportMcpToolsSummaryDto) _then;

  /// Create a copy of ImportMcpToolsSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? total = null,
    Object? imported = null,
    Object? overwritten = null,
    Object? skipped = null,
    Object? failed = null,
  }) {
    return _then(
      _ImportMcpToolsSummaryDto(
        total: null == total
            ? _self.total
            : total // ignore: cast_nullable_to_non_nullable
                  as int,
        imported: null == imported
            ? _self.imported
            : imported // ignore: cast_nullable_to_non_nullable
                  as int,
        overwritten: null == overwritten
            ? _self.overwritten
            : overwritten // ignore: cast_nullable_to_non_nullable
                  as int,
        skipped: null == skipped
            ? _self.skipped
            : skipped // ignore: cast_nullable_to_non_nullable
                  as int,
        failed: null == failed
            ? _self.failed
            : failed // ignore: cast_nullable_to_non_nullable
                  as int,
      ),
    );
  }
}

/// @nodoc
mixin _$ImportMcpToolsResultDto {
  String get mcpServerConfigId;
  ImportMcpToolsSummaryDto get summary;
  List<ImportedToolResultDto> get results;

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ImportMcpToolsResultDtoCopyWith<ImportMcpToolsResultDto> get copyWith =>
      _$ImportMcpToolsResultDtoCopyWithImpl<ImportMcpToolsResultDto>(
        this as ImportMcpToolsResultDto,
        _$identity,
      );

  /// Serializes this ImportMcpToolsResultDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ImportMcpToolsResultDto &&
            (identical(other.mcpServerConfigId, mcpServerConfigId) ||
                other.mcpServerConfigId == mcpServerConfigId) &&
            (identical(other.summary, summary) || other.summary == summary) &&
            const DeepCollectionEquality().equals(other.results, results));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    mcpServerConfigId,
    summary,
    const DeepCollectionEquality().hash(results),
  );

  @override
  String toString() {
    return 'ImportMcpToolsResultDto(mcpServerConfigId: $mcpServerConfigId, summary: $summary, results: $results)';
  }
}

/// @nodoc
abstract mixin class $ImportMcpToolsResultDtoCopyWith<$Res> {
  factory $ImportMcpToolsResultDtoCopyWith(
    ImportMcpToolsResultDto value,
    $Res Function(ImportMcpToolsResultDto) _then,
  ) = _$ImportMcpToolsResultDtoCopyWithImpl;
  @useResult
  $Res call({
    String mcpServerConfigId,
    ImportMcpToolsSummaryDto summary,
    List<ImportedToolResultDto> results,
  });

  $ImportMcpToolsSummaryDtoCopyWith<$Res> get summary;
}

/// @nodoc
class _$ImportMcpToolsResultDtoCopyWithImpl<$Res>
    implements $ImportMcpToolsResultDtoCopyWith<$Res> {
  _$ImportMcpToolsResultDtoCopyWithImpl(this._self, this._then);

  final ImportMcpToolsResultDto _self;
  final $Res Function(ImportMcpToolsResultDto) _then;

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? mcpServerConfigId = null,
    Object? summary = null,
    Object? results = null,
  }) {
    return _then(
      _self.copyWith(
        mcpServerConfigId: null == mcpServerConfigId
            ? _self.mcpServerConfigId
            : mcpServerConfigId // ignore: cast_nullable_to_non_nullable
                  as String,
        summary: null == summary
            ? _self.summary
            : summary // ignore: cast_nullable_to_non_nullable
                  as ImportMcpToolsSummaryDto,
        results: null == results
            ? _self.results
            : results // ignore: cast_nullable_to_non_nullable
                  as List<ImportedToolResultDto>,
      ),
    );
  }

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ImportMcpToolsSummaryDtoCopyWith<$Res> get summary {
    return $ImportMcpToolsSummaryDtoCopyWith<$Res>(_self.summary, (value) {
      return _then(_self.copyWith(summary: value));
    });
  }
}

/// Adds pattern-matching-related methods to [ImportMcpToolsResultDto].
extension ImportMcpToolsResultDtoPatterns on ImportMcpToolsResultDto {
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
    TResult Function(_ImportMcpToolsResultDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto() when $default != null:
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
    TResult Function(_ImportMcpToolsResultDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto():
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
    TResult? Function(_ImportMcpToolsResultDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto() when $default != null:
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
      String mcpServerConfigId,
      ImportMcpToolsSummaryDto summary,
      List<ImportedToolResultDto> results,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto() when $default != null:
        return $default(_that.mcpServerConfigId, _that.summary, _that.results);
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
      String mcpServerConfigId,
      ImportMcpToolsSummaryDto summary,
      List<ImportedToolResultDto> results,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto():
        return $default(_that.mcpServerConfigId, _that.summary, _that.results);
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
      String mcpServerConfigId,
      ImportMcpToolsSummaryDto summary,
      List<ImportedToolResultDto> results,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ImportMcpToolsResultDto() when $default != null:
        return $default(_that.mcpServerConfigId, _that.summary, _that.results);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ImportMcpToolsResultDto implements ImportMcpToolsResultDto {
  const _ImportMcpToolsResultDto({
    required this.mcpServerConfigId,
    required this.summary,
    final List<ImportedToolResultDto> results = const <ImportedToolResultDto>[],
  }) : _results = results;
  factory _ImportMcpToolsResultDto.fromJson(Map<String, dynamic> json) =>
      _$ImportMcpToolsResultDtoFromJson(json);

  @override
  final String mcpServerConfigId;
  @override
  final ImportMcpToolsSummaryDto summary;
  final List<ImportedToolResultDto> _results;
  @override
  @JsonKey()
  List<ImportedToolResultDto> get results {
    if (_results is EqualUnmodifiableListView) return _results;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_results);
  }

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ImportMcpToolsResultDtoCopyWith<_ImportMcpToolsResultDto> get copyWith =>
      __$ImportMcpToolsResultDtoCopyWithImpl<_ImportMcpToolsResultDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ImportMcpToolsResultDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ImportMcpToolsResultDto &&
            (identical(other.mcpServerConfigId, mcpServerConfigId) ||
                other.mcpServerConfigId == mcpServerConfigId) &&
            (identical(other.summary, summary) || other.summary == summary) &&
            const DeepCollectionEquality().equals(other._results, _results));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    mcpServerConfigId,
    summary,
    const DeepCollectionEquality().hash(_results),
  );

  @override
  String toString() {
    return 'ImportMcpToolsResultDto(mcpServerConfigId: $mcpServerConfigId, summary: $summary, results: $results)';
  }
}

/// @nodoc
abstract mixin class _$ImportMcpToolsResultDtoCopyWith<$Res>
    implements $ImportMcpToolsResultDtoCopyWith<$Res> {
  factory _$ImportMcpToolsResultDtoCopyWith(
    _ImportMcpToolsResultDto value,
    $Res Function(_ImportMcpToolsResultDto) _then,
  ) = __$ImportMcpToolsResultDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String mcpServerConfigId,
    ImportMcpToolsSummaryDto summary,
    List<ImportedToolResultDto> results,
  });

  @override
  $ImportMcpToolsSummaryDtoCopyWith<$Res> get summary;
}

/// @nodoc
class __$ImportMcpToolsResultDtoCopyWithImpl<$Res>
    implements _$ImportMcpToolsResultDtoCopyWith<$Res> {
  __$ImportMcpToolsResultDtoCopyWithImpl(this._self, this._then);

  final _ImportMcpToolsResultDto _self;
  final $Res Function(_ImportMcpToolsResultDto) _then;

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? mcpServerConfigId = null,
    Object? summary = null,
    Object? results = null,
  }) {
    return _then(
      _ImportMcpToolsResultDto(
        mcpServerConfigId: null == mcpServerConfigId
            ? _self.mcpServerConfigId
            : mcpServerConfigId // ignore: cast_nullable_to_non_nullable
                  as String,
        summary: null == summary
            ? _self.summary
            : summary // ignore: cast_nullable_to_non_nullable
                  as ImportMcpToolsSummaryDto,
        results: null == results
            ? _self._results
            : results // ignore: cast_nullable_to_non_nullable
                  as List<ImportedToolResultDto>,
      ),
    );
  }

  /// Create a copy of ImportMcpToolsResultDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $ImportMcpToolsSummaryDtoCopyWith<$Res> get summary {
    return $ImportMcpToolsSummaryDtoCopyWith<$Res>(_self.summary, (value) {
      return _then(_self.copyWith(summary: value));
    });
  }
}

/// @nodoc
mixin _$McpToolDefinitionDto {
  String get id;
  String? get mcpServerConfigId;
  String? get source;
  String get name;
  String? get title;
  String? get description;
  Map<String, dynamic>? get inputSchema;
  Map<String, dynamic>? get outputSchema;
  McpPortMappingMetadataDto? get portMappingMetadata;
  Map<String, dynamic>? get annotations;
  bool get isActive;
  String? get importedAt;
  String? get createdAt;
  String? get updatedAt;

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpToolDefinitionDtoCopyWith<McpToolDefinitionDto> get copyWith =>
      _$McpToolDefinitionDtoCopyWithImpl<McpToolDefinitionDto>(
        this as McpToolDefinitionDto,
        _$identity,
      );

  /// Serializes this McpToolDefinitionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpToolDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.mcpServerConfigId, mcpServerConfigId) ||
                other.mcpServerConfigId == mcpServerConfigId) &&
            (identical(other.source, source) || other.source == source) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other.inputSchema,
              inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other.outputSchema,
              outputSchema,
            ) &&
            (identical(other.portMappingMetadata, portMappingMetadata) ||
                other.portMappingMetadata == portMappingMetadata) &&
            const DeepCollectionEquality().equals(
              other.annotations,
              annotations,
            ) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive) &&
            (identical(other.importedAt, importedAt) ||
                other.importedAt == importedAt) &&
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
    mcpServerConfigId,
    source,
    name,
    title,
    description,
    const DeepCollectionEquality().hash(inputSchema),
    const DeepCollectionEquality().hash(outputSchema),
    portMappingMetadata,
    const DeepCollectionEquality().hash(annotations),
    isActive,
    importedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'McpToolDefinitionDto(id: $id, mcpServerConfigId: $mcpServerConfigId, source: $source, name: $name, title: $title, description: $description, inputSchema: $inputSchema, outputSchema: $outputSchema, portMappingMetadata: $portMappingMetadata, annotations: $annotations, isActive: $isActive, importedAt: $importedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class $McpToolDefinitionDtoCopyWith<$Res> {
  factory $McpToolDefinitionDtoCopyWith(
    McpToolDefinitionDto value,
    $Res Function(McpToolDefinitionDto) _then,
  ) = _$McpToolDefinitionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String? mcpServerConfigId,
    String? source,
    String name,
    String? title,
    String? description,
    Map<String, dynamic>? inputSchema,
    Map<String, dynamic>? outputSchema,
    McpPortMappingMetadataDto? portMappingMetadata,
    Map<String, dynamic>? annotations,
    bool isActive,
    String? importedAt,
    String? createdAt,
    String? updatedAt,
  });

  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata;
}

/// @nodoc
class _$McpToolDefinitionDtoCopyWithImpl<$Res>
    implements $McpToolDefinitionDtoCopyWith<$Res> {
  _$McpToolDefinitionDtoCopyWithImpl(this._self, this._then);

  final McpToolDefinitionDto _self;
  final $Res Function(McpToolDefinitionDto) _then;

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? mcpServerConfigId = freezed,
    Object? source = freezed,
    Object? name = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? inputSchema = freezed,
    Object? outputSchema = freezed,
    Object? portMappingMetadata = freezed,
    Object? annotations = freezed,
    Object? isActive = null,
    Object? importedAt = freezed,
    Object? createdAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        mcpServerConfigId: freezed == mcpServerConfigId
            ? _self.mcpServerConfigId
            : mcpServerConfigId // ignore: cast_nullable_to_non_nullable
                  as String?,
        source: freezed == source
            ? _self.source
            : source // ignore: cast_nullable_to_non_nullable
                  as String?,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self.inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        outputSchema: freezed == outputSchema
            ? _self.outputSchema
            : outputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        portMappingMetadata: freezed == portMappingMetadata
            ? _self.portMappingMetadata
            : portMappingMetadata // ignore: cast_nullable_to_non_nullable
                  as McpPortMappingMetadataDto?,
        annotations: freezed == annotations
            ? _self.annotations
            : annotations // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        isActive: null == isActive
            ? _self.isActive
            : isActive // ignore: cast_nullable_to_non_nullable
                  as bool,
        importedAt: freezed == importedAt
            ? _self.importedAt
            : importedAt // ignore: cast_nullable_to_non_nullable
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

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata {
    if (_self.portMappingMetadata == null) {
      return null;
    }

    return $McpPortMappingMetadataDtoCopyWith<$Res>(
      _self.portMappingMetadata!,
      (value) {
        return _then(_self.copyWith(portMappingMetadata: value));
      },
    );
  }
}

/// Adds pattern-matching-related methods to [McpToolDefinitionDto].
extension McpToolDefinitionDtoPatterns on McpToolDefinitionDto {
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
    TResult Function(_McpToolDefinitionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto() when $default != null:
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
    TResult Function(_McpToolDefinitionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto():
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
    TResult? Function(_McpToolDefinitionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto() when $default != null:
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
      String? mcpServerConfigId,
      String? source,
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? outputSchema,
      McpPortMappingMetadataDto? portMappingMetadata,
      Map<String, dynamic>? annotations,
      bool isActive,
      String? importedAt,
      String? createdAt,
      String? updatedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.mcpServerConfigId,
          _that.source,
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.outputSchema,
          _that.portMappingMetadata,
          _that.annotations,
          _that.isActive,
          _that.importedAt,
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
      String? mcpServerConfigId,
      String? source,
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? outputSchema,
      McpPortMappingMetadataDto? portMappingMetadata,
      Map<String, dynamic>? annotations,
      bool isActive,
      String? importedAt,
      String? createdAt,
      String? updatedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto():
        return $default(
          _that.id,
          _that.mcpServerConfigId,
          _that.source,
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.outputSchema,
          _that.portMappingMetadata,
          _that.annotations,
          _that.isActive,
          _that.importedAt,
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
      String? mcpServerConfigId,
      String? source,
      String name,
      String? title,
      String? description,
      Map<String, dynamic>? inputSchema,
      Map<String, dynamic>? outputSchema,
      McpPortMappingMetadataDto? portMappingMetadata,
      Map<String, dynamic>? annotations,
      bool isActive,
      String? importedAt,
      String? createdAt,
      String? updatedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpToolDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.mcpServerConfigId,
          _that.source,
          _that.name,
          _that.title,
          _that.description,
          _that.inputSchema,
          _that.outputSchema,
          _that.portMappingMetadata,
          _that.annotations,
          _that.isActive,
          _that.importedAt,
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
class _McpToolDefinitionDto implements McpToolDefinitionDto {
  const _McpToolDefinitionDto({
    required this.id,
    this.mcpServerConfigId,
    this.source,
    required this.name,
    this.title,
    this.description,
    final Map<String, dynamic>? inputSchema,
    final Map<String, dynamic>? outputSchema,
    this.portMappingMetadata,
    final Map<String, dynamic>? annotations,
    this.isActive = true,
    this.importedAt,
    this.createdAt,
    this.updatedAt,
  }) : _inputSchema = inputSchema,
       _outputSchema = outputSchema,
       _annotations = annotations;
  factory _McpToolDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$McpToolDefinitionDtoFromJson(json);

  @override
  final String id;
  @override
  final String? mcpServerConfigId;
  @override
  final String? source;
  @override
  final String name;
  @override
  final String? title;
  @override
  final String? description;
  final Map<String, dynamic>? _inputSchema;
  @override
  Map<String, dynamic>? get inputSchema {
    final value = _inputSchema;
    if (value == null) return null;
    if (_inputSchema is EqualUnmodifiableMapView) return _inputSchema;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final Map<String, dynamic>? _outputSchema;
  @override
  Map<String, dynamic>? get outputSchema {
    final value = _outputSchema;
    if (value == null) return null;
    if (_outputSchema is EqualUnmodifiableMapView) return _outputSchema;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final McpPortMappingMetadataDto? portMappingMetadata;
  final Map<String, dynamic>? _annotations;
  @override
  Map<String, dynamic>? get annotations {
    final value = _annotations;
    if (value == null) return null;
    if (_annotations is EqualUnmodifiableMapView) return _annotations;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey()
  final bool isActive;
  @override
  final String? importedAt;
  @override
  final String? createdAt;
  @override
  final String? updatedAt;

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpToolDefinitionDtoCopyWith<_McpToolDefinitionDto> get copyWith =>
      __$McpToolDefinitionDtoCopyWithImpl<_McpToolDefinitionDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$McpToolDefinitionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpToolDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.mcpServerConfigId, mcpServerConfigId) ||
                other.mcpServerConfigId == mcpServerConfigId) &&
            (identical(other.source, source) || other.source == source) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            const DeepCollectionEquality().equals(
              other._inputSchema,
              _inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other._outputSchema,
              _outputSchema,
            ) &&
            (identical(other.portMappingMetadata, portMappingMetadata) ||
                other.portMappingMetadata == portMappingMetadata) &&
            const DeepCollectionEquality().equals(
              other._annotations,
              _annotations,
            ) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive) &&
            (identical(other.importedAt, importedAt) ||
                other.importedAt == importedAt) &&
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
    mcpServerConfigId,
    source,
    name,
    title,
    description,
    const DeepCollectionEquality().hash(_inputSchema),
    const DeepCollectionEquality().hash(_outputSchema),
    portMappingMetadata,
    const DeepCollectionEquality().hash(_annotations),
    isActive,
    importedAt,
    createdAt,
    updatedAt,
  );

  @override
  String toString() {
    return 'McpToolDefinitionDto(id: $id, mcpServerConfigId: $mcpServerConfigId, source: $source, name: $name, title: $title, description: $description, inputSchema: $inputSchema, outputSchema: $outputSchema, portMappingMetadata: $portMappingMetadata, annotations: $annotations, isActive: $isActive, importedAt: $importedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }
}

/// @nodoc
abstract mixin class _$McpToolDefinitionDtoCopyWith<$Res>
    implements $McpToolDefinitionDtoCopyWith<$Res> {
  factory _$McpToolDefinitionDtoCopyWith(
    _McpToolDefinitionDto value,
    $Res Function(_McpToolDefinitionDto) _then,
  ) = __$McpToolDefinitionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String? mcpServerConfigId,
    String? source,
    String name,
    String? title,
    String? description,
    Map<String, dynamic>? inputSchema,
    Map<String, dynamic>? outputSchema,
    McpPortMappingMetadataDto? portMappingMetadata,
    Map<String, dynamic>? annotations,
    bool isActive,
    String? importedAt,
    String? createdAt,
    String? updatedAt,
  });

  @override
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata;
}

/// @nodoc
class __$McpToolDefinitionDtoCopyWithImpl<$Res>
    implements _$McpToolDefinitionDtoCopyWith<$Res> {
  __$McpToolDefinitionDtoCopyWithImpl(this._self, this._then);

  final _McpToolDefinitionDto _self;
  final $Res Function(_McpToolDefinitionDto) _then;

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? mcpServerConfigId = freezed,
    Object? source = freezed,
    Object? name = null,
    Object? title = freezed,
    Object? description = freezed,
    Object? inputSchema = freezed,
    Object? outputSchema = freezed,
    Object? portMappingMetadata = freezed,
    Object? annotations = freezed,
    Object? isActive = null,
    Object? importedAt = freezed,
    Object? createdAt = freezed,
    Object? updatedAt = freezed,
  }) {
    return _then(
      _McpToolDefinitionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        mcpServerConfigId: freezed == mcpServerConfigId
            ? _self.mcpServerConfigId
            : mcpServerConfigId // ignore: cast_nullable_to_non_nullable
                  as String?,
        source: freezed == source
            ? _self.source
            : source // ignore: cast_nullable_to_non_nullable
                  as String?,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        title: freezed == title
            ? _self.title
            : title // ignore: cast_nullable_to_non_nullable
                  as String?,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self._inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        outputSchema: freezed == outputSchema
            ? _self._outputSchema
            : outputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        portMappingMetadata: freezed == portMappingMetadata
            ? _self.portMappingMetadata
            : portMappingMetadata // ignore: cast_nullable_to_non_nullable
                  as McpPortMappingMetadataDto?,
        annotations: freezed == annotations
            ? _self._annotations
            : annotations // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        isActive: null == isActive
            ? _self.isActive
            : isActive // ignore: cast_nullable_to_non_nullable
                  as bool,
        importedAt: freezed == importedAt
            ? _self.importedAt
            : importedAt // ignore: cast_nullable_to_non_nullable
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

  /// Create a copy of McpToolDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpPortMappingMetadataDtoCopyWith<$Res>? get portMappingMetadata {
    if (_self.portMappingMetadata == null) {
      return null;
    }

    return $McpPortMappingMetadataDtoCopyWith<$Res>(
      _self.portMappingMetadata!,
      (value) {
        return _then(_self.copyWith(portMappingMetadata: value));
      },
    );
  }
}

/// @nodoc
mixin _$McpServerConfigSummaryDto {
  String get id;
  String get tenantId;
  String get organizationId;
  String get name;
  String? get description;
  String get transportType;
  String get status;
  String? get lastTestedAt;
  String get createdAt;
  String get updatedAt;
  int get toolCount;
  String get sourceKind;

  /// Create a copy of McpServerConfigSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpServerConfigSummaryDtoCopyWith<McpServerConfigSummaryDto> get copyWith =>
      _$McpServerConfigSummaryDtoCopyWithImpl<McpServerConfigSummaryDto>(
        this as McpServerConfigSummaryDto,
        _$identity,
      );

  /// Serializes this McpServerConfigSummaryDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpServerConfigSummaryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastTestedAt, lastTestedAt) ||
                other.lastTestedAt == lastTestedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.toolCount, toolCount) ||
                other.toolCount == toolCount) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    organizationId,
    name,
    description,
    transportType,
    status,
    lastTestedAt,
    createdAt,
    updatedAt,
    toolCount,
    sourceKind,
  );

  @override
  String toString() {
    return 'McpServerConfigSummaryDto(id: $id, tenantId: $tenantId, organizationId: $organizationId, name: $name, description: $description, transportType: $transportType, status: $status, lastTestedAt: $lastTestedAt, createdAt: $createdAt, updatedAt: $updatedAt, toolCount: $toolCount, sourceKind: $sourceKind)';
  }
}

/// @nodoc
abstract mixin class $McpServerConfigSummaryDtoCopyWith<$Res> {
  factory $McpServerConfigSummaryDtoCopyWith(
    McpServerConfigSummaryDto value,
    $Res Function(McpServerConfigSummaryDto) _then,
  ) = _$McpServerConfigSummaryDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String tenantId,
    String organizationId,
    String name,
    String? description,
    String transportType,
    String status,
    String? lastTestedAt,
    String createdAt,
    String updatedAt,
    int toolCount,
    String sourceKind,
  });
}

/// @nodoc
class _$McpServerConfigSummaryDtoCopyWithImpl<$Res>
    implements $McpServerConfigSummaryDtoCopyWith<$Res> {
  _$McpServerConfigSummaryDtoCopyWithImpl(this._self, this._then);

  final McpServerConfigSummaryDto _self;
  final $Res Function(McpServerConfigSummaryDto) _then;

  /// Create a copy of McpServerConfigSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? transportType = null,
    Object? status = null,
    Object? lastTestedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? toolCount = null,
    Object? sourceKind = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastTestedAt: freezed == lastTestedAt
            ? _self.lastTestedAt
            : lastTestedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        toolCount: null == toolCount
            ? _self.toolCount
            : toolCount // ignore: cast_nullable_to_non_nullable
                  as int,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [McpServerConfigSummaryDto].
extension McpServerConfigSummaryDtoPatterns on McpServerConfigSummaryDto {
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
    TResult Function(_McpServerConfigSummaryDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto() when $default != null:
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
    TResult Function(_McpServerConfigSummaryDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto():
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
    TResult? Function(_McpServerConfigSummaryDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto() when $default != null:
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      int toolCount,
      String sourceKind,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.toolCount,
          _that.sourceKind,
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      int toolCount,
      String sourceKind,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto():
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.toolCount,
          _that.sourceKind,
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      int toolCount,
      String sourceKind,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigSummaryDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.toolCount,
          _that.sourceKind,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpServerConfigSummaryDto implements McpServerConfigSummaryDto {
  const _McpServerConfigSummaryDto({
    required this.id,
    required this.tenantId,
    required this.organizationId,
    required this.name,
    this.description,
    required this.transportType,
    required this.status,
    this.lastTestedAt,
    required this.createdAt,
    required this.updatedAt,
    this.toolCount = 0,
    this.sourceKind = 'manual',
  });
  factory _McpServerConfigSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$McpServerConfigSummaryDtoFromJson(json);

  @override
  final String id;
  @override
  final String tenantId;
  @override
  final String organizationId;
  @override
  final String name;
  @override
  final String? description;
  @override
  final String transportType;
  @override
  final String status;
  @override
  final String? lastTestedAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  @JsonKey()
  final int toolCount;
  @override
  @JsonKey()
  final String sourceKind;

  /// Create a copy of McpServerConfigSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpServerConfigSummaryDtoCopyWith<_McpServerConfigSummaryDto>
  get copyWith =>
      __$McpServerConfigSummaryDtoCopyWithImpl<_McpServerConfigSummaryDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$McpServerConfigSummaryDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpServerConfigSummaryDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastTestedAt, lastTestedAt) ||
                other.lastTestedAt == lastTestedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.toolCount, toolCount) ||
                other.toolCount == toolCount) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    organizationId,
    name,
    description,
    transportType,
    status,
    lastTestedAt,
    createdAt,
    updatedAt,
    toolCount,
    sourceKind,
  );

  @override
  String toString() {
    return 'McpServerConfigSummaryDto(id: $id, tenantId: $tenantId, organizationId: $organizationId, name: $name, description: $description, transportType: $transportType, status: $status, lastTestedAt: $lastTestedAt, createdAt: $createdAt, updatedAt: $updatedAt, toolCount: $toolCount, sourceKind: $sourceKind)';
  }
}

/// @nodoc
abstract mixin class _$McpServerConfigSummaryDtoCopyWith<$Res>
    implements $McpServerConfigSummaryDtoCopyWith<$Res> {
  factory _$McpServerConfigSummaryDtoCopyWith(
    _McpServerConfigSummaryDto value,
    $Res Function(_McpServerConfigSummaryDto) _then,
  ) = __$McpServerConfigSummaryDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String tenantId,
    String organizationId,
    String name,
    String? description,
    String transportType,
    String status,
    String? lastTestedAt,
    String createdAt,
    String updatedAt,
    int toolCount,
    String sourceKind,
  });
}

/// @nodoc
class __$McpServerConfigSummaryDtoCopyWithImpl<$Res>
    implements _$McpServerConfigSummaryDtoCopyWith<$Res> {
  __$McpServerConfigSummaryDtoCopyWithImpl(this._self, this._then);

  final _McpServerConfigSummaryDto _self;
  final $Res Function(_McpServerConfigSummaryDto) _then;

  /// Create a copy of McpServerConfigSummaryDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? transportType = null,
    Object? status = null,
    Object? lastTestedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? toolCount = null,
    Object? sourceKind = null,
  }) {
    return _then(
      _McpServerConfigSummaryDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastTestedAt: freezed == lastTestedAt
            ? _self.lastTestedAt
            : lastTestedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        toolCount: null == toolCount
            ? _self.toolCount
            : toolCount // ignore: cast_nullable_to_non_nullable
                  as int,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
mixin _$McpServerConfigDetailDto {
  String get id;
  String get tenantId;
  String get organizationId;
  String get name;
  String? get description;
  String get transportType;
  String get status;
  String? get lastTestedAt;
  String get createdAt;
  String get updatedAt;
  McpConnectionConfigDto get connection;
  List<String> get credentialKeys;
  List<McpToolDefinitionDto> get tools;
  String get sourceKind;

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $McpServerConfigDetailDtoCopyWith<McpServerConfigDetailDto> get copyWith =>
      _$McpServerConfigDetailDtoCopyWithImpl<McpServerConfigDetailDto>(
        this as McpServerConfigDetailDto,
        _$identity,
      );

  /// Serializes this McpServerConfigDetailDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is McpServerConfigDetailDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastTestedAt, lastTestedAt) ||
                other.lastTestedAt == lastTestedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.connection, connection) ||
                other.connection == connection) &&
            const DeepCollectionEquality().equals(
              other.credentialKeys,
              credentialKeys,
            ) &&
            const DeepCollectionEquality().equals(other.tools, tools) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    organizationId,
    name,
    description,
    transportType,
    status,
    lastTestedAt,
    createdAt,
    updatedAt,
    connection,
    const DeepCollectionEquality().hash(credentialKeys),
    const DeepCollectionEquality().hash(tools),
    sourceKind,
  );

  @override
  String toString() {
    return 'McpServerConfigDetailDto(id: $id, tenantId: $tenantId, organizationId: $organizationId, name: $name, description: $description, transportType: $transportType, status: $status, lastTestedAt: $lastTestedAt, createdAt: $createdAt, updatedAt: $updatedAt, connection: $connection, credentialKeys: $credentialKeys, tools: $tools, sourceKind: $sourceKind)';
  }
}

/// @nodoc
abstract mixin class $McpServerConfigDetailDtoCopyWith<$Res> {
  factory $McpServerConfigDetailDtoCopyWith(
    McpServerConfigDetailDto value,
    $Res Function(McpServerConfigDetailDto) _then,
  ) = _$McpServerConfigDetailDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String tenantId,
    String organizationId,
    String name,
    String? description,
    String transportType,
    String status,
    String? lastTestedAt,
    String createdAt,
    String updatedAt,
    McpConnectionConfigDto connection,
    List<String> credentialKeys,
    List<McpToolDefinitionDto> tools,
    String sourceKind,
  });

  $McpConnectionConfigDtoCopyWith<$Res> get connection;
}

/// @nodoc
class _$McpServerConfigDetailDtoCopyWithImpl<$Res>
    implements $McpServerConfigDetailDtoCopyWith<$Res> {
  _$McpServerConfigDetailDtoCopyWithImpl(this._self, this._then);

  final McpServerConfigDetailDto _self;
  final $Res Function(McpServerConfigDetailDto) _then;

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? transportType = null,
    Object? status = null,
    Object? lastTestedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? connection = null,
    Object? credentialKeys = null,
    Object? tools = null,
    Object? sourceKind = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastTestedAt: freezed == lastTestedAt
            ? _self.lastTestedAt
            : lastTestedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        connection: null == connection
            ? _self.connection
            : connection // ignore: cast_nullable_to_non_nullable
                  as McpConnectionConfigDto,
        credentialKeys: null == credentialKeys
            ? _self.credentialKeys
            : credentialKeys // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        tools: null == tools
            ? _self.tools
            : tools // ignore: cast_nullable_to_non_nullable
                  as List<McpToolDefinitionDto>,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpConnectionConfigDtoCopyWith<$Res> get connection {
    return $McpConnectionConfigDtoCopyWith<$Res>(_self.connection, (value) {
      return _then(_self.copyWith(connection: value));
    });
  }
}

/// Adds pattern-matching-related methods to [McpServerConfigDetailDto].
extension McpServerConfigDetailDtoPatterns on McpServerConfigDetailDto {
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
    TResult Function(_McpServerConfigDetailDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto() when $default != null:
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
    TResult Function(_McpServerConfigDetailDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto():
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
    TResult? Function(_McpServerConfigDetailDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto() when $default != null:
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      McpConnectionConfigDto connection,
      List<String> credentialKeys,
      List<McpToolDefinitionDto> tools,
      String sourceKind,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.connection,
          _that.credentialKeys,
          _that.tools,
          _that.sourceKind,
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      McpConnectionConfigDto connection,
      List<String> credentialKeys,
      List<McpToolDefinitionDto> tools,
      String sourceKind,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto():
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.connection,
          _that.credentialKeys,
          _that.tools,
          _that.sourceKind,
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
      String tenantId,
      String organizationId,
      String name,
      String? description,
      String transportType,
      String status,
      String? lastTestedAt,
      String createdAt,
      String updatedAt,
      McpConnectionConfigDto connection,
      List<String> credentialKeys,
      List<McpToolDefinitionDto> tools,
      String sourceKind,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _McpServerConfigDetailDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.organizationId,
          _that.name,
          _that.description,
          _that.transportType,
          _that.status,
          _that.lastTestedAt,
          _that.createdAt,
          _that.updatedAt,
          _that.connection,
          _that.credentialKeys,
          _that.tools,
          _that.sourceKind,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _McpServerConfigDetailDto implements McpServerConfigDetailDto {
  const _McpServerConfigDetailDto({
    required this.id,
    required this.tenantId,
    required this.organizationId,
    required this.name,
    this.description,
    required this.transportType,
    required this.status,
    this.lastTestedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.connection,
    final List<String> credentialKeys = const <String>[],
    final List<McpToolDefinitionDto> tools = const <McpToolDefinitionDto>[],
    this.sourceKind = 'manual',
  }) : _credentialKeys = credentialKeys,
       _tools = tools;
  factory _McpServerConfigDetailDto.fromJson(Map<String, dynamic> json) =>
      _$McpServerConfigDetailDtoFromJson(json);

  @override
  final String id;
  @override
  final String tenantId;
  @override
  final String organizationId;
  @override
  final String name;
  @override
  final String? description;
  @override
  final String transportType;
  @override
  final String status;
  @override
  final String? lastTestedAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final McpConnectionConfigDto connection;
  final List<String> _credentialKeys;
  @override
  @JsonKey()
  List<String> get credentialKeys {
    if (_credentialKeys is EqualUnmodifiableListView) return _credentialKeys;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_credentialKeys);
  }

  final List<McpToolDefinitionDto> _tools;
  @override
  @JsonKey()
  List<McpToolDefinitionDto> get tools {
    if (_tools is EqualUnmodifiableListView) return _tools;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_tools);
  }

  @override
  @JsonKey()
  final String sourceKind;

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$McpServerConfigDetailDtoCopyWith<_McpServerConfigDetailDto> get copyWith =>
      __$McpServerConfigDetailDtoCopyWithImpl<_McpServerConfigDetailDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$McpServerConfigDetailDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _McpServerConfigDetailDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.transportType, transportType) ||
                other.transportType == transportType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.lastTestedAt, lastTestedAt) ||
                other.lastTestedAt == lastTestedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.connection, connection) ||
                other.connection == connection) &&
            const DeepCollectionEquality().equals(
              other._credentialKeys,
              _credentialKeys,
            ) &&
            const DeepCollectionEquality().equals(other._tools, _tools) &&
            (identical(other.sourceKind, sourceKind) ||
                other.sourceKind == sourceKind));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    organizationId,
    name,
    description,
    transportType,
    status,
    lastTestedAt,
    createdAt,
    updatedAt,
    connection,
    const DeepCollectionEquality().hash(_credentialKeys),
    const DeepCollectionEquality().hash(_tools),
    sourceKind,
  );

  @override
  String toString() {
    return 'McpServerConfigDetailDto(id: $id, tenantId: $tenantId, organizationId: $organizationId, name: $name, description: $description, transportType: $transportType, status: $status, lastTestedAt: $lastTestedAt, createdAt: $createdAt, updatedAt: $updatedAt, connection: $connection, credentialKeys: $credentialKeys, tools: $tools, sourceKind: $sourceKind)';
  }
}

/// @nodoc
abstract mixin class _$McpServerConfigDetailDtoCopyWith<$Res>
    implements $McpServerConfigDetailDtoCopyWith<$Res> {
  factory _$McpServerConfigDetailDtoCopyWith(
    _McpServerConfigDetailDto value,
    $Res Function(_McpServerConfigDetailDto) _then,
  ) = __$McpServerConfigDetailDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String tenantId,
    String organizationId,
    String name,
    String? description,
    String transportType,
    String status,
    String? lastTestedAt,
    String createdAt,
    String updatedAt,
    McpConnectionConfigDto connection,
    List<String> credentialKeys,
    List<McpToolDefinitionDto> tools,
    String sourceKind,
  });

  @override
  $McpConnectionConfigDtoCopyWith<$Res> get connection;
}

/// @nodoc
class __$McpServerConfigDetailDtoCopyWithImpl<$Res>
    implements _$McpServerConfigDetailDtoCopyWith<$Res> {
  __$McpServerConfigDetailDtoCopyWithImpl(this._self, this._then);

  final _McpServerConfigDetailDto _self;
  final $Res Function(_McpServerConfigDetailDto) _then;

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? organizationId = null,
    Object? name = null,
    Object? description = freezed,
    Object? transportType = null,
    Object? status = null,
    Object? lastTestedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? connection = null,
    Object? credentialKeys = null,
    Object? tools = null,
    Object? sourceKind = null,
  }) {
    return _then(
      _McpServerConfigDetailDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        organizationId: null == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        transportType: null == transportType
            ? _self.transportType
            : transportType // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        lastTestedAt: freezed == lastTestedAt
            ? _self.lastTestedAt
            : lastTestedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        connection: null == connection
            ? _self.connection
            : connection // ignore: cast_nullable_to_non_nullable
                  as McpConnectionConfigDto,
        credentialKeys: null == credentialKeys
            ? _self._credentialKeys
            : credentialKeys // ignore: cast_nullable_to_non_nullable
                  as List<String>,
        tools: null == tools
            ? _self._tools
            : tools // ignore: cast_nullable_to_non_nullable
                  as List<McpToolDefinitionDto>,
        sourceKind: null == sourceKind
            ? _self.sourceKind
            : sourceKind // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }

  /// Create a copy of McpServerConfigDetailDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $McpConnectionConfigDtoCopyWith<$Res> get connection {
    return $McpConnectionConfigDtoCopyWith<$Res>(_self.connection, (value) {
      return _then(_self.copyWith(connection: value));
    });
  }
}
