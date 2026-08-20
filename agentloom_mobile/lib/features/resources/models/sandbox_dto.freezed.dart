// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'sandbox_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$SandboxConfigDto {
  double get cpu;
  int get memory;
  int get disk;
  int get timeout;
  int? get timeoutSeconds;
  String get lifecycleMode;
  String? get name;
  int? get persistenceExpiryHours;
  String? get restoreWorkspaceId;

  /// Create a copy of SandboxConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SandboxConfigDtoCopyWith<SandboxConfigDto> get copyWith =>
      _$SandboxConfigDtoCopyWithImpl<SandboxConfigDto>(
        this as SandboxConfigDto,
        _$identity,
      );

  /// Serializes this SandboxConfigDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SandboxConfigDto &&
            (identical(other.cpu, cpu) || other.cpu == cpu) &&
            (identical(other.memory, memory) || other.memory == memory) &&
            (identical(other.disk, disk) || other.disk == disk) &&
            (identical(other.timeout, timeout) || other.timeout == timeout) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds) &&
            (identical(other.lifecycleMode, lifecycleMode) ||
                other.lifecycleMode == lifecycleMode) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.persistenceExpiryHours, persistenceExpiryHours) ||
                other.persistenceExpiryHours == persistenceExpiryHours) &&
            (identical(other.restoreWorkspaceId, restoreWorkspaceId) ||
                other.restoreWorkspaceId == restoreWorkspaceId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    cpu,
    memory,
    disk,
    timeout,
    timeoutSeconds,
    lifecycleMode,
    name,
    persistenceExpiryHours,
    restoreWorkspaceId,
  );

  @override
  String toString() {
    return 'SandboxConfigDto(cpu: $cpu, memory: $memory, disk: $disk, timeout: $timeout, timeoutSeconds: $timeoutSeconds, lifecycleMode: $lifecycleMode, name: $name, persistenceExpiryHours: $persistenceExpiryHours, restoreWorkspaceId: $restoreWorkspaceId)';
  }
}

/// @nodoc
abstract mixin class $SandboxConfigDtoCopyWith<$Res> {
  factory $SandboxConfigDtoCopyWith(
    SandboxConfigDto value,
    $Res Function(SandboxConfigDto) _then,
  ) = _$SandboxConfigDtoCopyWithImpl;
  @useResult
  $Res call({
    double cpu,
    int memory,
    int disk,
    int timeout,
    int? timeoutSeconds,
    String lifecycleMode,
    String? name,
    int? persistenceExpiryHours,
    String? restoreWorkspaceId,
  });
}

/// @nodoc
class _$SandboxConfigDtoCopyWithImpl<$Res>
    implements $SandboxConfigDtoCopyWith<$Res> {
  _$SandboxConfigDtoCopyWithImpl(this._self, this._then);

  final SandboxConfigDto _self;
  final $Res Function(SandboxConfigDto) _then;

  /// Create a copy of SandboxConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? cpu = null,
    Object? memory = null,
    Object? disk = null,
    Object? timeout = null,
    Object? timeoutSeconds = freezed,
    Object? lifecycleMode = null,
    Object? name = freezed,
    Object? persistenceExpiryHours = freezed,
    Object? restoreWorkspaceId = freezed,
  }) {
    return _then(
      _self.copyWith(
        cpu: null == cpu
            ? _self.cpu
            : cpu // ignore: cast_nullable_to_non_nullable
                  as double,
        memory: null == memory
            ? _self.memory
            : memory // ignore: cast_nullable_to_non_nullable
                  as int,
        disk: null == disk
            ? _self.disk
            : disk // ignore: cast_nullable_to_non_nullable
                  as int,
        timeout: null == timeout
            ? _self.timeout
            : timeout // ignore: cast_nullable_to_non_nullable
                  as int,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
        lifecycleMode: null == lifecycleMode
            ? _self.lifecycleMode
            : lifecycleMode // ignore: cast_nullable_to_non_nullable
                  as String,
        name: freezed == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String?,
        persistenceExpiryHours: freezed == persistenceExpiryHours
            ? _self.persistenceExpiryHours
            : persistenceExpiryHours // ignore: cast_nullable_to_non_nullable
                  as int?,
        restoreWorkspaceId: freezed == restoreWorkspaceId
            ? _self.restoreWorkspaceId
            : restoreWorkspaceId // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [SandboxConfigDto].
extension SandboxConfigDtoPatterns on SandboxConfigDto {
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
    TResult Function(_SandboxConfigDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto() when $default != null:
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
    TResult Function(_SandboxConfigDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto():
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
    TResult? Function(_SandboxConfigDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto() when $default != null:
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
      double cpu,
      int memory,
      int disk,
      int timeout,
      int? timeoutSeconds,
      String lifecycleMode,
      String? name,
      int? persistenceExpiryHours,
      String? restoreWorkspaceId,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto() when $default != null:
        return $default(
          _that.cpu,
          _that.memory,
          _that.disk,
          _that.timeout,
          _that.timeoutSeconds,
          _that.lifecycleMode,
          _that.name,
          _that.persistenceExpiryHours,
          _that.restoreWorkspaceId,
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
      double cpu,
      int memory,
      int disk,
      int timeout,
      int? timeoutSeconds,
      String lifecycleMode,
      String? name,
      int? persistenceExpiryHours,
      String? restoreWorkspaceId,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto():
        return $default(
          _that.cpu,
          _that.memory,
          _that.disk,
          _that.timeout,
          _that.timeoutSeconds,
          _that.lifecycleMode,
          _that.name,
          _that.persistenceExpiryHours,
          _that.restoreWorkspaceId,
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
      double cpu,
      int memory,
      int disk,
      int timeout,
      int? timeoutSeconds,
      String lifecycleMode,
      String? name,
      int? persistenceExpiryHours,
      String? restoreWorkspaceId,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxConfigDto() when $default != null:
        return $default(
          _that.cpu,
          _that.memory,
          _that.disk,
          _that.timeout,
          _that.timeoutSeconds,
          _that.lifecycleMode,
          _that.name,
          _that.persistenceExpiryHours,
          _that.restoreWorkspaceId,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SandboxConfigDto extends SandboxConfigDto {
  const _SandboxConfigDto({
    this.cpu = 1,
    this.memory = 512,
    this.disk = 2,
    this.timeout = 24,
    this.timeoutSeconds,
    this.lifecycleMode = 'session',
    this.name,
    this.persistenceExpiryHours,
    this.restoreWorkspaceId,
  }) : super._();
  factory _SandboxConfigDto.fromJson(Map<String, dynamic> json) =>
      _$SandboxConfigDtoFromJson(json);

  @override
  @JsonKey()
  final double cpu;
  @override
  @JsonKey()
  final int memory;
  @override
  @JsonKey()
  final int disk;
  @override
  @JsonKey()
  final int timeout;
  @override
  final int? timeoutSeconds;
  @override
  @JsonKey()
  final String lifecycleMode;
  @override
  final String? name;
  @override
  final int? persistenceExpiryHours;
  @override
  final String? restoreWorkspaceId;

  /// Create a copy of SandboxConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SandboxConfigDtoCopyWith<_SandboxConfigDto> get copyWith =>
      __$SandboxConfigDtoCopyWithImpl<_SandboxConfigDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SandboxConfigDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SandboxConfigDto &&
            (identical(other.cpu, cpu) || other.cpu == cpu) &&
            (identical(other.memory, memory) || other.memory == memory) &&
            (identical(other.disk, disk) || other.disk == disk) &&
            (identical(other.timeout, timeout) || other.timeout == timeout) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds) &&
            (identical(other.lifecycleMode, lifecycleMode) ||
                other.lifecycleMode == lifecycleMode) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.persistenceExpiryHours, persistenceExpiryHours) ||
                other.persistenceExpiryHours == persistenceExpiryHours) &&
            (identical(other.restoreWorkspaceId, restoreWorkspaceId) ||
                other.restoreWorkspaceId == restoreWorkspaceId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    cpu,
    memory,
    disk,
    timeout,
    timeoutSeconds,
    lifecycleMode,
    name,
    persistenceExpiryHours,
    restoreWorkspaceId,
  );

  @override
  String toString() {
    return 'SandboxConfigDto(cpu: $cpu, memory: $memory, disk: $disk, timeout: $timeout, timeoutSeconds: $timeoutSeconds, lifecycleMode: $lifecycleMode, name: $name, persistenceExpiryHours: $persistenceExpiryHours, restoreWorkspaceId: $restoreWorkspaceId)';
  }
}

/// @nodoc
abstract mixin class _$SandboxConfigDtoCopyWith<$Res>
    implements $SandboxConfigDtoCopyWith<$Res> {
  factory _$SandboxConfigDtoCopyWith(
    _SandboxConfigDto value,
    $Res Function(_SandboxConfigDto) _then,
  ) = __$SandboxConfigDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    double cpu,
    int memory,
    int disk,
    int timeout,
    int? timeoutSeconds,
    String lifecycleMode,
    String? name,
    int? persistenceExpiryHours,
    String? restoreWorkspaceId,
  });
}

/// @nodoc
class __$SandboxConfigDtoCopyWithImpl<$Res>
    implements _$SandboxConfigDtoCopyWith<$Res> {
  __$SandboxConfigDtoCopyWithImpl(this._self, this._then);

  final _SandboxConfigDto _self;
  final $Res Function(_SandboxConfigDto) _then;

  /// Create a copy of SandboxConfigDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? cpu = null,
    Object? memory = null,
    Object? disk = null,
    Object? timeout = null,
    Object? timeoutSeconds = freezed,
    Object? lifecycleMode = null,
    Object? name = freezed,
    Object? persistenceExpiryHours = freezed,
    Object? restoreWorkspaceId = freezed,
  }) {
    return _then(
      _SandboxConfigDto(
        cpu: null == cpu
            ? _self.cpu
            : cpu // ignore: cast_nullable_to_non_nullable
                  as double,
        memory: null == memory
            ? _self.memory
            : memory // ignore: cast_nullable_to_non_nullable
                  as int,
        disk: null == disk
            ? _self.disk
            : disk // ignore: cast_nullable_to_non_nullable
                  as int,
        timeout: null == timeout
            ? _self.timeout
            : timeout // ignore: cast_nullable_to_non_nullable
                  as int,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
        lifecycleMode: null == lifecycleMode
            ? _self.lifecycleMode
            : lifecycleMode // ignore: cast_nullable_to_non_nullable
                  as String,
        name: freezed == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String?,
        persistenceExpiryHours: freezed == persistenceExpiryHours
            ? _self.persistenceExpiryHours
            : persistenceExpiryHours // ignore: cast_nullable_to_non_nullable
                  as int?,
        restoreWorkspaceId: freezed == restoreWorkspaceId
            ? _self.restoreWorkspaceId
            : restoreWorkspaceId // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// @nodoc
mixin _$SandboxSessionDto {
  String get id;
  String get tenantId;
  String get status;
  SandboxConfigDto get config;
  String get createdAt;
  String get bindingType;
  String? get executionId;
  String? get agentConversationId;
  String? get sandboxNodeId;
  String? get workspacePath;
  String? get startedAt;
  String? get stoppedAt;

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SandboxSessionDtoCopyWith<SandboxSessionDto> get copyWith =>
      _$SandboxSessionDtoCopyWithImpl<SandboxSessionDto>(
        this as SandboxSessionDto,
        _$identity,
      );

  /// Serializes this SandboxSessionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SandboxSessionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.config, config) || other.config == config) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.bindingType, bindingType) ||
                other.bindingType == bindingType) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.agentConversationId, agentConversationId) ||
                other.agentConversationId == agentConversationId) &&
            (identical(other.sandboxNodeId, sandboxNodeId) ||
                other.sandboxNodeId == sandboxNodeId) &&
            (identical(other.workspacePath, workspacePath) ||
                other.workspacePath == workspacePath) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.stoppedAt, stoppedAt) ||
                other.stoppedAt == stoppedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    status,
    config,
    createdAt,
    bindingType,
    executionId,
    agentConversationId,
    sandboxNodeId,
    workspacePath,
    startedAt,
    stoppedAt,
  );

  @override
  String toString() {
    return 'SandboxSessionDto(id: $id, tenantId: $tenantId, status: $status, config: $config, createdAt: $createdAt, bindingType: $bindingType, executionId: $executionId, agentConversationId: $agentConversationId, sandboxNodeId: $sandboxNodeId, workspacePath: $workspacePath, startedAt: $startedAt, stoppedAt: $stoppedAt)';
  }
}

/// @nodoc
abstract mixin class $SandboxSessionDtoCopyWith<$Res> {
  factory $SandboxSessionDtoCopyWith(
    SandboxSessionDto value,
    $Res Function(SandboxSessionDto) _then,
  ) = _$SandboxSessionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String tenantId,
    String status,
    SandboxConfigDto config,
    String createdAt,
    String bindingType,
    String? executionId,
    String? agentConversationId,
    String? sandboxNodeId,
    String? workspacePath,
    String? startedAt,
    String? stoppedAt,
  });

  $SandboxConfigDtoCopyWith<$Res> get config;
}

/// @nodoc
class _$SandboxSessionDtoCopyWithImpl<$Res>
    implements $SandboxSessionDtoCopyWith<$Res> {
  _$SandboxSessionDtoCopyWithImpl(this._self, this._then);

  final SandboxSessionDto _self;
  final $Res Function(SandboxSessionDto) _then;

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? status = null,
    Object? config = null,
    Object? createdAt = null,
    Object? bindingType = null,
    Object? executionId = freezed,
    Object? agentConversationId = freezed,
    Object? sandboxNodeId = freezed,
    Object? workspacePath = freezed,
    Object? startedAt = freezed,
    Object? stoppedAt = freezed,
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
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        config: null == config
            ? _self.config
            : config // ignore: cast_nullable_to_non_nullable
                  as SandboxConfigDto,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        bindingType: null == bindingType
            ? _self.bindingType
            : bindingType // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        agentConversationId: freezed == agentConversationId
            ? _self.agentConversationId
            : agentConversationId // ignore: cast_nullable_to_non_nullable
                  as String?,
        sandboxNodeId: freezed == sandboxNodeId
            ? _self.sandboxNodeId
            : sandboxNodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        workspacePath: freezed == workspacePath
            ? _self.workspacePath
            : workspacePath // ignore: cast_nullable_to_non_nullable
                  as String?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        stoppedAt: freezed == stoppedAt
            ? _self.stoppedAt
            : stoppedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $SandboxConfigDtoCopyWith<$Res> get config {
    return $SandboxConfigDtoCopyWith<$Res>(_self.config, (value) {
      return _then(_self.copyWith(config: value));
    });
  }
}

/// Adds pattern-matching-related methods to [SandboxSessionDto].
extension SandboxSessionDtoPatterns on SandboxSessionDto {
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
    TResult Function(_SandboxSessionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto() when $default != null:
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
    TResult Function(_SandboxSessionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto():
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
    TResult? Function(_SandboxSessionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto() when $default != null:
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
      String status,
      SandboxConfigDto config,
      String createdAt,
      String bindingType,
      String? executionId,
      String? agentConversationId,
      String? sandboxNodeId,
      String? workspacePath,
      String? startedAt,
      String? stoppedAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.status,
          _that.config,
          _that.createdAt,
          _that.bindingType,
          _that.executionId,
          _that.agentConversationId,
          _that.sandboxNodeId,
          _that.workspacePath,
          _that.startedAt,
          _that.stoppedAt,
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
      String status,
      SandboxConfigDto config,
      String createdAt,
      String bindingType,
      String? executionId,
      String? agentConversationId,
      String? sandboxNodeId,
      String? workspacePath,
      String? startedAt,
      String? stoppedAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto():
        return $default(
          _that.id,
          _that.tenantId,
          _that.status,
          _that.config,
          _that.createdAt,
          _that.bindingType,
          _that.executionId,
          _that.agentConversationId,
          _that.sandboxNodeId,
          _that.workspacePath,
          _that.startedAt,
          _that.stoppedAt,
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
      String status,
      SandboxConfigDto config,
      String createdAt,
      String bindingType,
      String? executionId,
      String? agentConversationId,
      String? sandboxNodeId,
      String? workspacePath,
      String? startedAt,
      String? stoppedAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxSessionDto() when $default != null:
        return $default(
          _that.id,
          _that.tenantId,
          _that.status,
          _that.config,
          _that.createdAt,
          _that.bindingType,
          _that.executionId,
          _that.agentConversationId,
          _that.sandboxNodeId,
          _that.workspacePath,
          _that.startedAt,
          _that.stoppedAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SandboxSessionDto extends SandboxSessionDto {
  const _SandboxSessionDto({
    required this.id,
    required this.tenantId,
    required this.status,
    required this.config,
    required this.createdAt,
    this.bindingType = 'resource',
    this.executionId,
    this.agentConversationId,
    this.sandboxNodeId,
    this.workspacePath,
    this.startedAt,
    this.stoppedAt,
  }) : super._();
  factory _SandboxSessionDto.fromJson(Map<String, dynamic> json) =>
      _$SandboxSessionDtoFromJson(json);

  @override
  final String id;
  @override
  final String tenantId;
  @override
  final String status;
  @override
  final SandboxConfigDto config;
  @override
  final String createdAt;
  @override
  @JsonKey()
  final String bindingType;
  @override
  final String? executionId;
  @override
  final String? agentConversationId;
  @override
  final String? sandboxNodeId;
  @override
  final String? workspacePath;
  @override
  final String? startedAt;
  @override
  final String? stoppedAt;

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SandboxSessionDtoCopyWith<_SandboxSessionDto> get copyWith =>
      __$SandboxSessionDtoCopyWithImpl<_SandboxSessionDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SandboxSessionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SandboxSessionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.config, config) || other.config == config) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.bindingType, bindingType) ||
                other.bindingType == bindingType) &&
            (identical(other.executionId, executionId) ||
                other.executionId == executionId) &&
            (identical(other.agentConversationId, agentConversationId) ||
                other.agentConversationId == agentConversationId) &&
            (identical(other.sandboxNodeId, sandboxNodeId) ||
                other.sandboxNodeId == sandboxNodeId) &&
            (identical(other.workspacePath, workspacePath) ||
                other.workspacePath == workspacePath) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.stoppedAt, stoppedAt) ||
                other.stoppedAt == stoppedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    tenantId,
    status,
    config,
    createdAt,
    bindingType,
    executionId,
    agentConversationId,
    sandboxNodeId,
    workspacePath,
    startedAt,
    stoppedAt,
  );

  @override
  String toString() {
    return 'SandboxSessionDto(id: $id, tenantId: $tenantId, status: $status, config: $config, createdAt: $createdAt, bindingType: $bindingType, executionId: $executionId, agentConversationId: $agentConversationId, sandboxNodeId: $sandboxNodeId, workspacePath: $workspacePath, startedAt: $startedAt, stoppedAt: $stoppedAt)';
  }
}

/// @nodoc
abstract mixin class _$SandboxSessionDtoCopyWith<$Res>
    implements $SandboxSessionDtoCopyWith<$Res> {
  factory _$SandboxSessionDtoCopyWith(
    _SandboxSessionDto value,
    $Res Function(_SandboxSessionDto) _then,
  ) = __$SandboxSessionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String tenantId,
    String status,
    SandboxConfigDto config,
    String createdAt,
    String bindingType,
    String? executionId,
    String? agentConversationId,
    String? sandboxNodeId,
    String? workspacePath,
    String? startedAt,
    String? stoppedAt,
  });

  @override
  $SandboxConfigDtoCopyWith<$Res> get config;
}

/// @nodoc
class __$SandboxSessionDtoCopyWithImpl<$Res>
    implements _$SandboxSessionDtoCopyWith<$Res> {
  __$SandboxSessionDtoCopyWithImpl(this._self, this._then);

  final _SandboxSessionDto _self;
  final $Res Function(_SandboxSessionDto) _then;

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? tenantId = null,
    Object? status = null,
    Object? config = null,
    Object? createdAt = null,
    Object? bindingType = null,
    Object? executionId = freezed,
    Object? agentConversationId = freezed,
    Object? sandboxNodeId = freezed,
    Object? workspacePath = freezed,
    Object? startedAt = freezed,
    Object? stoppedAt = freezed,
  }) {
    return _then(
      _SandboxSessionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        tenantId: null == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        config: null == config
            ? _self.config
            : config // ignore: cast_nullable_to_non_nullable
                  as SandboxConfigDto,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        bindingType: null == bindingType
            ? _self.bindingType
            : bindingType // ignore: cast_nullable_to_non_nullable
                  as String,
        executionId: freezed == executionId
            ? _self.executionId
            : executionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        agentConversationId: freezed == agentConversationId
            ? _self.agentConversationId
            : agentConversationId // ignore: cast_nullable_to_non_nullable
                  as String?,
        sandboxNodeId: freezed == sandboxNodeId
            ? _self.sandboxNodeId
            : sandboxNodeId // ignore: cast_nullable_to_non_nullable
                  as String?,
        workspacePath: freezed == workspacePath
            ? _self.workspacePath
            : workspacePath // ignore: cast_nullable_to_non_nullable
                  as String?,
        startedAt: freezed == startedAt
            ? _self.startedAt
            : startedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
        stoppedAt: freezed == stoppedAt
            ? _self.stoppedAt
            : stoppedAt // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }

  /// Create a copy of SandboxSessionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $SandboxConfigDtoCopyWith<$Res> get config {
    return $SandboxConfigDtoCopyWith<$Res>(_self.config, (value) {
      return _then(_self.copyWith(config: value));
    });
  }
}

/// @nodoc
mixin _$SandboxStatsDto {
  double get cpuPercent;
  double get memoryUsageMb;
  double get memoryLimitMb;
  int? get diskUsage;
  int? get diskTotal;

  /// Create a copy of SandboxStatsDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SandboxStatsDtoCopyWith<SandboxStatsDto> get copyWith =>
      _$SandboxStatsDtoCopyWithImpl<SandboxStatsDto>(
        this as SandboxStatsDto,
        _$identity,
      );

  /// Serializes this SandboxStatsDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SandboxStatsDto &&
            (identical(other.cpuPercent, cpuPercent) ||
                other.cpuPercent == cpuPercent) &&
            (identical(other.memoryUsageMb, memoryUsageMb) ||
                other.memoryUsageMb == memoryUsageMb) &&
            (identical(other.memoryLimitMb, memoryLimitMb) ||
                other.memoryLimitMb == memoryLimitMb) &&
            (identical(other.diskUsage, diskUsage) ||
                other.diskUsage == diskUsage) &&
            (identical(other.diskTotal, diskTotal) ||
                other.diskTotal == diskTotal));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    cpuPercent,
    memoryUsageMb,
    memoryLimitMb,
    diskUsage,
    diskTotal,
  );

  @override
  String toString() {
    return 'SandboxStatsDto(cpuPercent: $cpuPercent, memoryUsageMb: $memoryUsageMb, memoryLimitMb: $memoryLimitMb, diskUsage: $diskUsage, diskTotal: $diskTotal)';
  }
}

/// @nodoc
abstract mixin class $SandboxStatsDtoCopyWith<$Res> {
  factory $SandboxStatsDtoCopyWith(
    SandboxStatsDto value,
    $Res Function(SandboxStatsDto) _then,
  ) = _$SandboxStatsDtoCopyWithImpl;
  @useResult
  $Res call({
    double cpuPercent,
    double memoryUsageMb,
    double memoryLimitMb,
    int? diskUsage,
    int? diskTotal,
  });
}

/// @nodoc
class _$SandboxStatsDtoCopyWithImpl<$Res>
    implements $SandboxStatsDtoCopyWith<$Res> {
  _$SandboxStatsDtoCopyWithImpl(this._self, this._then);

  final SandboxStatsDto _self;
  final $Res Function(SandboxStatsDto) _then;

  /// Create a copy of SandboxStatsDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? cpuPercent = null,
    Object? memoryUsageMb = null,
    Object? memoryLimitMb = null,
    Object? diskUsage = freezed,
    Object? diskTotal = freezed,
  }) {
    return _then(
      _self.copyWith(
        cpuPercent: null == cpuPercent
            ? _self.cpuPercent
            : cpuPercent // ignore: cast_nullable_to_non_nullable
                  as double,
        memoryUsageMb: null == memoryUsageMb
            ? _self.memoryUsageMb
            : memoryUsageMb // ignore: cast_nullable_to_non_nullable
                  as double,
        memoryLimitMb: null == memoryLimitMb
            ? _self.memoryLimitMb
            : memoryLimitMb // ignore: cast_nullable_to_non_nullable
                  as double,
        diskUsage: freezed == diskUsage
            ? _self.diskUsage
            : diskUsage // ignore: cast_nullable_to_non_nullable
                  as int?,
        diskTotal: freezed == diskTotal
            ? _self.diskTotal
            : diskTotal // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [SandboxStatsDto].
extension SandboxStatsDtoPatterns on SandboxStatsDto {
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
    TResult Function(_SandboxStatsDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto() when $default != null:
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
    TResult Function(_SandboxStatsDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto():
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
    TResult? Function(_SandboxStatsDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto() when $default != null:
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
      double cpuPercent,
      double memoryUsageMb,
      double memoryLimitMb,
      int? diskUsage,
      int? diskTotal,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto() when $default != null:
        return $default(
          _that.cpuPercent,
          _that.memoryUsageMb,
          _that.memoryLimitMb,
          _that.diskUsage,
          _that.diskTotal,
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
      double cpuPercent,
      double memoryUsageMb,
      double memoryLimitMb,
      int? diskUsage,
      int? diskTotal,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto():
        return $default(
          _that.cpuPercent,
          _that.memoryUsageMb,
          _that.memoryLimitMb,
          _that.diskUsage,
          _that.diskTotal,
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
      double cpuPercent,
      double memoryUsageMb,
      double memoryLimitMb,
      int? diskUsage,
      int? diskTotal,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxStatsDto() when $default != null:
        return $default(
          _that.cpuPercent,
          _that.memoryUsageMb,
          _that.memoryLimitMb,
          _that.diskUsage,
          _that.diskTotal,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SandboxStatsDto extends SandboxStatsDto {
  const _SandboxStatsDto({
    required this.cpuPercent,
    required this.memoryUsageMb,
    required this.memoryLimitMb,
    this.diskUsage,
    this.diskTotal,
  }) : super._();
  factory _SandboxStatsDto.fromJson(Map<String, dynamic> json) =>
      _$SandboxStatsDtoFromJson(json);

  @override
  final double cpuPercent;
  @override
  final double memoryUsageMb;
  @override
  final double memoryLimitMb;
  @override
  final int? diskUsage;
  @override
  final int? diskTotal;

  /// Create a copy of SandboxStatsDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SandboxStatsDtoCopyWith<_SandboxStatsDto> get copyWith =>
      __$SandboxStatsDtoCopyWithImpl<_SandboxStatsDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SandboxStatsDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SandboxStatsDto &&
            (identical(other.cpuPercent, cpuPercent) ||
                other.cpuPercent == cpuPercent) &&
            (identical(other.memoryUsageMb, memoryUsageMb) ||
                other.memoryUsageMb == memoryUsageMb) &&
            (identical(other.memoryLimitMb, memoryLimitMb) ||
                other.memoryLimitMb == memoryLimitMb) &&
            (identical(other.diskUsage, diskUsage) ||
                other.diskUsage == diskUsage) &&
            (identical(other.diskTotal, diskTotal) ||
                other.diskTotal == diskTotal));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    cpuPercent,
    memoryUsageMb,
    memoryLimitMb,
    diskUsage,
    diskTotal,
  );

  @override
  String toString() {
    return 'SandboxStatsDto(cpuPercent: $cpuPercent, memoryUsageMb: $memoryUsageMb, memoryLimitMb: $memoryLimitMb, diskUsage: $diskUsage, diskTotal: $diskTotal)';
  }
}

/// @nodoc
abstract mixin class _$SandboxStatsDtoCopyWith<$Res>
    implements $SandboxStatsDtoCopyWith<$Res> {
  factory _$SandboxStatsDtoCopyWith(
    _SandboxStatsDto value,
    $Res Function(_SandboxStatsDto) _then,
  ) = __$SandboxStatsDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    double cpuPercent,
    double memoryUsageMb,
    double memoryLimitMb,
    int? diskUsage,
    int? diskTotal,
  });
}

/// @nodoc
class __$SandboxStatsDtoCopyWithImpl<$Res>
    implements _$SandboxStatsDtoCopyWith<$Res> {
  __$SandboxStatsDtoCopyWithImpl(this._self, this._then);

  final _SandboxStatsDto _self;
  final $Res Function(_SandboxStatsDto) _then;

  /// Create a copy of SandboxStatsDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? cpuPercent = null,
    Object? memoryUsageMb = null,
    Object? memoryLimitMb = null,
    Object? diskUsage = freezed,
    Object? diskTotal = freezed,
  }) {
    return _then(
      _SandboxStatsDto(
        cpuPercent: null == cpuPercent
            ? _self.cpuPercent
            : cpuPercent // ignore: cast_nullable_to_non_nullable
                  as double,
        memoryUsageMb: null == memoryUsageMb
            ? _self.memoryUsageMb
            : memoryUsageMb // ignore: cast_nullable_to_non_nullable
                  as double,
        memoryLimitMb: null == memoryLimitMb
            ? _self.memoryLimitMb
            : memoryLimitMb // ignore: cast_nullable_to_non_nullable
                  as double,
        diskUsage: freezed == diskUsage
            ? _self.diskUsage
            : diskUsage // ignore: cast_nullable_to_non_nullable
                  as int?,
        diskTotal: freezed == diskTotal
            ? _self.diskTotal
            : diskTotal // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}

/// @nodoc
mixin _$SandboxLogDto {
  String get id;
  String get sessionId;
  String get level;
  String get message;
  String get createdAt;

  /// Create a copy of SandboxLogDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $SandboxLogDtoCopyWith<SandboxLogDto> get copyWith =>
      _$SandboxLogDtoCopyWithImpl<SandboxLogDto>(
        this as SandboxLogDto,
        _$identity,
      );

  /// Serializes this SandboxLogDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is SandboxLogDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.level, level) || other.level == level) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, sessionId, level, message, createdAt);

  @override
  String toString() {
    return 'SandboxLogDto(id: $id, sessionId: $sessionId, level: $level, message: $message, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class $SandboxLogDtoCopyWith<$Res> {
  factory $SandboxLogDtoCopyWith(
    SandboxLogDto value,
    $Res Function(SandboxLogDto) _then,
  ) = _$SandboxLogDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String sessionId,
    String level,
    String message,
    String createdAt,
  });
}

/// @nodoc
class _$SandboxLogDtoCopyWithImpl<$Res>
    implements $SandboxLogDtoCopyWith<$Res> {
  _$SandboxLogDtoCopyWithImpl(this._self, this._then);

  final SandboxLogDto _self;
  final $Res Function(SandboxLogDto) _then;

  /// Create a copy of SandboxLogDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? level = null,
    Object? message = null,
    Object? createdAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        sessionId: null == sessionId
            ? _self.sessionId
            : sessionId // ignore: cast_nullable_to_non_nullable
                  as String,
        level: null == level
            ? _self.level
            : level // ignore: cast_nullable_to_non_nullable
                  as String,
        message: null == message
            ? _self.message
            : message // ignore: cast_nullable_to_non_nullable
                  as String,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [SandboxLogDto].
extension SandboxLogDtoPatterns on SandboxLogDto {
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
    TResult Function(_SandboxLogDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto() when $default != null:
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
    TResult Function(_SandboxLogDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto():
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
    TResult? Function(_SandboxLogDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto() when $default != null:
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
      String sessionId,
      String level,
      String message,
      String createdAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto() when $default != null:
        return $default(
          _that.id,
          _that.sessionId,
          _that.level,
          _that.message,
          _that.createdAt,
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
      String sessionId,
      String level,
      String message,
      String createdAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto():
        return $default(
          _that.id,
          _that.sessionId,
          _that.level,
          _that.message,
          _that.createdAt,
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
      String sessionId,
      String level,
      String message,
      String createdAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _SandboxLogDto() when $default != null:
        return $default(
          _that.id,
          _that.sessionId,
          _that.level,
          _that.message,
          _that.createdAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _SandboxLogDto implements SandboxLogDto {
  const _SandboxLogDto({
    required this.id,
    required this.sessionId,
    this.level = 'stdout',
    required this.message,
    required this.createdAt,
  });
  factory _SandboxLogDto.fromJson(Map<String, dynamic> json) =>
      _$SandboxLogDtoFromJson(json);

  @override
  final String id;
  @override
  final String sessionId;
  @override
  @JsonKey()
  final String level;
  @override
  final String message;
  @override
  final String createdAt;

  /// Create a copy of SandboxLogDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$SandboxLogDtoCopyWith<_SandboxLogDto> get copyWith =>
      __$SandboxLogDtoCopyWithImpl<_SandboxLogDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$SandboxLogDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _SandboxLogDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.level, level) || other.level == level) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, sessionId, level, message, createdAt);

  @override
  String toString() {
    return 'SandboxLogDto(id: $id, sessionId: $sessionId, level: $level, message: $message, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class _$SandboxLogDtoCopyWith<$Res>
    implements $SandboxLogDtoCopyWith<$Res> {
  factory _$SandboxLogDtoCopyWith(
    _SandboxLogDto value,
    $Res Function(_SandboxLogDto) _then,
  ) = __$SandboxLogDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String sessionId,
    String level,
    String message,
    String createdAt,
  });
}

/// @nodoc
class __$SandboxLogDtoCopyWithImpl<$Res>
    implements _$SandboxLogDtoCopyWith<$Res> {
  __$SandboxLogDtoCopyWithImpl(this._self, this._then);

  final _SandboxLogDto _self;
  final $Res Function(_SandboxLogDto) _then;

  /// Create a copy of SandboxLogDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? level = null,
    Object? message = null,
    Object? createdAt = null,
  }) {
    return _then(
      _SandboxLogDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        sessionId: null == sessionId
            ? _self.sessionId
            : sessionId // ignore: cast_nullable_to_non_nullable
                  as String,
        level: null == level
            ? _self.level
            : level // ignore: cast_nullable_to_non_nullable
                  as String,
        message: null == message
            ? _self.message
            : message // ignore: cast_nullable_to_non_nullable
                  as String,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}
