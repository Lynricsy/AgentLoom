// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'agent_definition_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$AgentDefinitionDto {
  String get id;
  String get name;
  String get slug;
  String? get description;
  String? get icon;
  String get status;
  String get runtimeMode;
  int? get version;
  String? get publishedVersionId;
  String? get tenantId;
  String? get createdBy;
  String? get updatedBy;
  String get createdAt;
  String get updatedAt;
  String? get systemPrompt;
  @JsonKey(fromJson: _mapListFromJson)
  List<Map<String, dynamic>> get nodes;
  @JsonKey(fromJson: _mapListFromJson)
  List<Map<String, dynamic>> get edges;
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get viewport;
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get sandboxConfig;
  String? get workspaceSnapshotId;
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get inputSchema;
  @JsonKey(fromJson: _nullableStringListFromJson)
  List<String>? get memoryInstanceIds;
  String? get sandboxLifecycle;
  String? get organizationId;
  String? get modelId;
  String? get autonomyMode;
  int? get maxIterations;
  int? get timeoutSeconds;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $AgentDefinitionDtoCopyWith<AgentDefinitionDto> get copyWith =>
      _$AgentDefinitionDtoCopyWithImpl<AgentDefinitionDto>(
        this as AgentDefinitionDto,
        _$identity,
      );

  /// Serializes this AgentDefinitionDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is AgentDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.icon, icon) || other.icon == icon) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.runtimeMode, runtimeMode) ||
                other.runtimeMode == runtimeMode) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.publishedVersionId, publishedVersionId) ||
                other.publishedVersionId == publishedVersionId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.updatedBy, updatedBy) ||
                other.updatedBy == updatedBy) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            const DeepCollectionEquality().equals(other.nodes, nodes) &&
            const DeepCollectionEquality().equals(other.edges, edges) &&
            const DeepCollectionEquality().equals(other.viewport, viewport) &&
            const DeepCollectionEquality().equals(
              other.sandboxConfig,
              sandboxConfig,
            ) &&
            (identical(other.workspaceSnapshotId, workspaceSnapshotId) ||
                other.workspaceSnapshotId == workspaceSnapshotId) &&
            const DeepCollectionEquality().equals(
              other.inputSchema,
              inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other.memoryInstanceIds,
              memoryInstanceIds,
            ) &&
            (identical(other.sandboxLifecycle, sandboxLifecycle) ||
                other.sandboxLifecycle == sandboxLifecycle) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.autonomyMode, autonomyMode) ||
                other.autonomyMode == autonomyMode) &&
            (identical(other.maxIterations, maxIterations) ||
                other.maxIterations == maxIterations) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hashAll([
    runtimeType,
    id,
    name,
    slug,
    description,
    icon,
    status,
    runtimeMode,
    version,
    publishedVersionId,
    tenantId,
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
    systemPrompt,
    const DeepCollectionEquality().hash(nodes),
    const DeepCollectionEquality().hash(edges),
    const DeepCollectionEquality().hash(viewport),
    const DeepCollectionEquality().hash(sandboxConfig),
    workspaceSnapshotId,
    const DeepCollectionEquality().hash(inputSchema),
    const DeepCollectionEquality().hash(memoryInstanceIds),
    sandboxLifecycle,
    organizationId,
    modelId,
    autonomyMode,
    maxIterations,
    timeoutSeconds,
  ]);

  @override
  String toString() {
    return 'AgentDefinitionDto(id: $id, name: $name, slug: $slug, description: $description, icon: $icon, status: $status, runtimeMode: $runtimeMode, version: $version, publishedVersionId: $publishedVersionId, tenantId: $tenantId, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt, systemPrompt: $systemPrompt, nodes: $nodes, edges: $edges, viewport: $viewport, sandboxConfig: $sandboxConfig, workspaceSnapshotId: $workspaceSnapshotId, inputSchema: $inputSchema, memoryInstanceIds: $memoryInstanceIds, sandboxLifecycle: $sandboxLifecycle, organizationId: $organizationId, modelId: $modelId, autonomyMode: $autonomyMode, maxIterations: $maxIterations, timeoutSeconds: $timeoutSeconds)';
  }
}

/// @nodoc
abstract mixin class $AgentDefinitionDtoCopyWith<$Res> {
  factory $AgentDefinitionDtoCopyWith(
    AgentDefinitionDto value,
    $Res Function(AgentDefinitionDto) _then,
  ) = _$AgentDefinitionDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    String name,
    String slug,
    String? description,
    String? icon,
    String status,
    String runtimeMode,
    int? version,
    String? publishedVersionId,
    String? tenantId,
    String? createdBy,
    String? updatedBy,
    String createdAt,
    String updatedAt,
    String? systemPrompt,
    @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> nodes,
    @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> edges,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
    @JsonKey(fromJson: _nullableMapFromJson)
    Map<String, dynamic>? sandboxConfig,
    String? workspaceSnapshotId,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? inputSchema,
    @JsonKey(fromJson: _nullableStringListFromJson)
    List<String>? memoryInstanceIds,
    String? sandboxLifecycle,
    String? organizationId,
    String? modelId,
    String? autonomyMode,
    int? maxIterations,
    int? timeoutSeconds,
  });
}

/// @nodoc
class _$AgentDefinitionDtoCopyWithImpl<$Res>
    implements $AgentDefinitionDtoCopyWith<$Res> {
  _$AgentDefinitionDtoCopyWithImpl(this._self, this._then);

  final AgentDefinitionDto _self;
  final $Res Function(AgentDefinitionDto) _then;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? icon = freezed,
    Object? status = null,
    Object? runtimeMode = null,
    Object? version = freezed,
    Object? publishedVersionId = freezed,
    Object? tenantId = freezed,
    Object? createdBy = freezed,
    Object? updatedBy = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? systemPrompt = freezed,
    Object? nodes = null,
    Object? edges = null,
    Object? viewport = freezed,
    Object? sandboxConfig = freezed,
    Object? workspaceSnapshotId = freezed,
    Object? inputSchema = freezed,
    Object? memoryInstanceIds = freezed,
    Object? sandboxLifecycle = freezed,
    Object? organizationId = freezed,
    Object? modelId = freezed,
    Object? autonomyMode = freezed,
    Object? maxIterations = freezed,
    Object? timeoutSeconds = freezed,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        icon: freezed == icon
            ? _self.icon
            : icon // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        runtimeMode: null == runtimeMode
            ? _self.runtimeMode
            : runtimeMode // ignore: cast_nullable_to_non_nullable
                  as String,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int?,
        publishedVersionId: freezed == publishedVersionId
            ? _self.publishedVersionId
            : publishedVersionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        tenantId: freezed == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedBy: freezed == updatedBy
            ? _self.updatedBy
            : updatedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        systemPrompt: freezed == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodes: null == nodes
            ? _self.nodes
            : nodes // ignore: cast_nullable_to_non_nullable
                  as List<Map<String, dynamic>>,
        edges: null == edges
            ? _self.edges
            : edges // ignore: cast_nullable_to_non_nullable
                  as List<Map<String, dynamic>>,
        viewport: freezed == viewport
            ? _self.viewport
            : viewport // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        sandboxConfig: freezed == sandboxConfig
            ? _self.sandboxConfig
            : sandboxConfig // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        workspaceSnapshotId: freezed == workspaceSnapshotId
            ? _self.workspaceSnapshotId
            : workspaceSnapshotId // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self.inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        memoryInstanceIds: freezed == memoryInstanceIds
            ? _self.memoryInstanceIds
            : memoryInstanceIds // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        sandboxLifecycle: freezed == sandboxLifecycle
            ? _self.sandboxLifecycle
            : sandboxLifecycle // ignore: cast_nullable_to_non_nullable
                  as String?,
        organizationId: freezed == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String?,
        modelId: freezed == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String?,
        autonomyMode: freezed == autonomyMode
            ? _self.autonomyMode
            : autonomyMode // ignore: cast_nullable_to_non_nullable
                  as String?,
        maxIterations: freezed == maxIterations
            ? _self.maxIterations
            : maxIterations // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [AgentDefinitionDto].
extension AgentDefinitionDtoPatterns on AgentDefinitionDto {
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
    TResult Function(_AgentDefinitionDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
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
    TResult Function(_AgentDefinitionDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto():
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
    TResult? Function(_AgentDefinitionDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
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
      String name,
      String slug,
      String? description,
      String? icon,
      String status,
      String runtimeMode,
      int? version,
      String? publishedVersionId,
      String? tenantId,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
      String? systemPrompt,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> nodes,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> edges,
      @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? sandboxConfig,
      String? workspaceSnapshotId,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? inputSchema,
      @JsonKey(fromJson: _nullableStringListFromJson)
      List<String>? memoryInstanceIds,
      String? sandboxLifecycle,
      String? organizationId,
      String? modelId,
      String? autonomyMode,
      int? maxIterations,
      int? timeoutSeconds,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.runtimeMode,
          _that.version,
          _that.publishedVersionId,
          _that.tenantId,
          _that.createdBy,
          _that.updatedBy,
          _that.createdAt,
          _that.updatedAt,
          _that.systemPrompt,
          _that.nodes,
          _that.edges,
          _that.viewport,
          _that.sandboxConfig,
          _that.workspaceSnapshotId,
          _that.inputSchema,
          _that.memoryInstanceIds,
          _that.sandboxLifecycle,
          _that.organizationId,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
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
      String name,
      String slug,
      String? description,
      String? icon,
      String status,
      String runtimeMode,
      int? version,
      String? publishedVersionId,
      String? tenantId,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
      String? systemPrompt,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> nodes,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> edges,
      @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? sandboxConfig,
      String? workspaceSnapshotId,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? inputSchema,
      @JsonKey(fromJson: _nullableStringListFromJson)
      List<String>? memoryInstanceIds,
      String? sandboxLifecycle,
      String? organizationId,
      String? modelId,
      String? autonomyMode,
      int? maxIterations,
      int? timeoutSeconds,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto():
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.runtimeMode,
          _that.version,
          _that.publishedVersionId,
          _that.tenantId,
          _that.createdBy,
          _that.updatedBy,
          _that.createdAt,
          _that.updatedAt,
          _that.systemPrompt,
          _that.nodes,
          _that.edges,
          _that.viewport,
          _that.sandboxConfig,
          _that.workspaceSnapshotId,
          _that.inputSchema,
          _that.memoryInstanceIds,
          _that.sandboxLifecycle,
          _that.organizationId,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
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
      String name,
      String slug,
      String? description,
      String? icon,
      String status,
      String runtimeMode,
      int? version,
      String? publishedVersionId,
      String? tenantId,
      String? createdBy,
      String? updatedBy,
      String createdAt,
      String updatedAt,
      String? systemPrompt,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> nodes,
      @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> edges,
      @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? sandboxConfig,
      String? workspaceSnapshotId,
      @JsonKey(fromJson: _nullableMapFromJson)
      Map<String, dynamic>? inputSchema,
      @JsonKey(fromJson: _nullableStringListFromJson)
      List<String>? memoryInstanceIds,
      String? sandboxLifecycle,
      String? organizationId,
      String? modelId,
      String? autonomyMode,
      int? maxIterations,
      int? timeoutSeconds,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _AgentDefinitionDto() when $default != null:
        return $default(
          _that.id,
          _that.name,
          _that.slug,
          _that.description,
          _that.icon,
          _that.status,
          _that.runtimeMode,
          _that.version,
          _that.publishedVersionId,
          _that.tenantId,
          _that.createdBy,
          _that.updatedBy,
          _that.createdAt,
          _that.updatedAt,
          _that.systemPrompt,
          _that.nodes,
          _that.edges,
          _that.viewport,
          _that.sandboxConfig,
          _that.workspaceSnapshotId,
          _that.inputSchema,
          _that.memoryInstanceIds,
          _that.sandboxLifecycle,
          _that.organizationId,
          _that.modelId,
          _that.autonomyMode,
          _that.maxIterations,
          _that.timeoutSeconds,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _AgentDefinitionDto extends AgentDefinitionDto {
  const _AgentDefinitionDto({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.icon,
    required this.status,
    this.runtimeMode = 'sandbox',
    this.version,
    this.publishedVersionId,
    this.tenantId,
    this.createdBy,
    this.updatedBy,
    required this.createdAt,
    required this.updatedAt,
    this.systemPrompt,
    @JsonKey(fromJson: _mapListFromJson)
    final List<Map<String, dynamic>> nodes = const <Map<String, dynamic>>[],
    @JsonKey(fromJson: _mapListFromJson)
    final List<Map<String, dynamic>> edges = const <Map<String, dynamic>>[],
    @JsonKey(fromJson: _nullableMapFromJson)
    final Map<String, dynamic>? viewport,
    @JsonKey(fromJson: _nullableMapFromJson)
    final Map<String, dynamic>? sandboxConfig,
    this.workspaceSnapshotId,
    @JsonKey(fromJson: _nullableMapFromJson)
    final Map<String, dynamic>? inputSchema,
    @JsonKey(fromJson: _nullableStringListFromJson)
    final List<String>? memoryInstanceIds,
    this.sandboxLifecycle,
    this.organizationId,
    this.modelId,
    this.autonomyMode,
    this.maxIterations,
    this.timeoutSeconds,
  }) : _nodes = nodes,
       _edges = edges,
       _viewport = viewport,
       _sandboxConfig = sandboxConfig,
       _inputSchema = inputSchema,
       _memoryInstanceIds = memoryInstanceIds,
       super._();
  factory _AgentDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$AgentDefinitionDtoFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String slug;
  @override
  final String? description;
  @override
  final String? icon;
  @override
  final String status;
  @override
  @JsonKey()
  final String runtimeMode;
  @override
  final int? version;
  @override
  final String? publishedVersionId;
  @override
  final String? tenantId;
  @override
  final String? createdBy;
  @override
  final String? updatedBy;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final String? systemPrompt;
  final List<Map<String, dynamic>> _nodes;
  @override
  @JsonKey(fromJson: _mapListFromJson)
  List<Map<String, dynamic>> get nodes {
    if (_nodes is EqualUnmodifiableListView) return _nodes;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_nodes);
  }

  final List<Map<String, dynamic>> _edges;
  @override
  @JsonKey(fromJson: _mapListFromJson)
  List<Map<String, dynamic>> get edges {
    if (_edges is EqualUnmodifiableListView) return _edges;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_edges);
  }

  final Map<String, dynamic>? _viewport;
  @override
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get viewport {
    final value = _viewport;
    if (value == null) return null;
    if (_viewport is EqualUnmodifiableMapView) return _viewport;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final Map<String, dynamic>? _sandboxConfig;
  @override
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get sandboxConfig {
    final value = _sandboxConfig;
    if (value == null) return null;
    if (_sandboxConfig is EqualUnmodifiableMapView) return _sandboxConfig;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final String? workspaceSnapshotId;
  final Map<String, dynamic>? _inputSchema;
  @override
  @JsonKey(fromJson: _nullableMapFromJson)
  Map<String, dynamic>? get inputSchema {
    final value = _inputSchema;
    if (value == null) return null;
    if (_inputSchema is EqualUnmodifiableMapView) return _inputSchema;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  final List<String>? _memoryInstanceIds;
  @override
  @JsonKey(fromJson: _nullableStringListFromJson)
  List<String>? get memoryInstanceIds {
    final value = _memoryInstanceIds;
    if (value == null) return null;
    if (_memoryInstanceIds is EqualUnmodifiableListView)
      return _memoryInstanceIds;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  final String? sandboxLifecycle;
  @override
  final String? organizationId;
  @override
  final String? modelId;
  @override
  final String? autonomyMode;
  @override
  final int? maxIterations;
  @override
  final int? timeoutSeconds;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$AgentDefinitionDtoCopyWith<_AgentDefinitionDto> get copyWith =>
      __$AgentDefinitionDtoCopyWithImpl<_AgentDefinitionDto>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$AgentDefinitionDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _AgentDefinitionDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.slug, slug) || other.slug == slug) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.icon, icon) || other.icon == icon) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.runtimeMode, runtimeMode) ||
                other.runtimeMode == runtimeMode) &&
            (identical(other.version, version) || other.version == version) &&
            (identical(other.publishedVersionId, publishedVersionId) ||
                other.publishedVersionId == publishedVersionId) &&
            (identical(other.tenantId, tenantId) ||
                other.tenantId == tenantId) &&
            (identical(other.createdBy, createdBy) ||
                other.createdBy == createdBy) &&
            (identical(other.updatedBy, updatedBy) ||
                other.updatedBy == updatedBy) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.systemPrompt, systemPrompt) ||
                other.systemPrompt == systemPrompt) &&
            const DeepCollectionEquality().equals(other._nodes, _nodes) &&
            const DeepCollectionEquality().equals(other._edges, _edges) &&
            const DeepCollectionEquality().equals(other._viewport, _viewport) &&
            const DeepCollectionEquality().equals(
              other._sandboxConfig,
              _sandboxConfig,
            ) &&
            (identical(other.workspaceSnapshotId, workspaceSnapshotId) ||
                other.workspaceSnapshotId == workspaceSnapshotId) &&
            const DeepCollectionEquality().equals(
              other._inputSchema,
              _inputSchema,
            ) &&
            const DeepCollectionEquality().equals(
              other._memoryInstanceIds,
              _memoryInstanceIds,
            ) &&
            (identical(other.sandboxLifecycle, sandboxLifecycle) ||
                other.sandboxLifecycle == sandboxLifecycle) &&
            (identical(other.organizationId, organizationId) ||
                other.organizationId == organizationId) &&
            (identical(other.modelId, modelId) || other.modelId == modelId) &&
            (identical(other.autonomyMode, autonomyMode) ||
                other.autonomyMode == autonomyMode) &&
            (identical(other.maxIterations, maxIterations) ||
                other.maxIterations == maxIterations) &&
            (identical(other.timeoutSeconds, timeoutSeconds) ||
                other.timeoutSeconds == timeoutSeconds));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hashAll([
    runtimeType,
    id,
    name,
    slug,
    description,
    icon,
    status,
    runtimeMode,
    version,
    publishedVersionId,
    tenantId,
    createdBy,
    updatedBy,
    createdAt,
    updatedAt,
    systemPrompt,
    const DeepCollectionEquality().hash(_nodes),
    const DeepCollectionEquality().hash(_edges),
    const DeepCollectionEquality().hash(_viewport),
    const DeepCollectionEquality().hash(_sandboxConfig),
    workspaceSnapshotId,
    const DeepCollectionEquality().hash(_inputSchema),
    const DeepCollectionEquality().hash(_memoryInstanceIds),
    sandboxLifecycle,
    organizationId,
    modelId,
    autonomyMode,
    maxIterations,
    timeoutSeconds,
  ]);

  @override
  String toString() {
    return 'AgentDefinitionDto(id: $id, name: $name, slug: $slug, description: $description, icon: $icon, status: $status, runtimeMode: $runtimeMode, version: $version, publishedVersionId: $publishedVersionId, tenantId: $tenantId, createdBy: $createdBy, updatedBy: $updatedBy, createdAt: $createdAt, updatedAt: $updatedAt, systemPrompt: $systemPrompt, nodes: $nodes, edges: $edges, viewport: $viewport, sandboxConfig: $sandboxConfig, workspaceSnapshotId: $workspaceSnapshotId, inputSchema: $inputSchema, memoryInstanceIds: $memoryInstanceIds, sandboxLifecycle: $sandboxLifecycle, organizationId: $organizationId, modelId: $modelId, autonomyMode: $autonomyMode, maxIterations: $maxIterations, timeoutSeconds: $timeoutSeconds)';
  }
}

/// @nodoc
abstract mixin class _$AgentDefinitionDtoCopyWith<$Res>
    implements $AgentDefinitionDtoCopyWith<$Res> {
  factory _$AgentDefinitionDtoCopyWith(
    _AgentDefinitionDto value,
    $Res Function(_AgentDefinitionDto) _then,
  ) = __$AgentDefinitionDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String slug,
    String? description,
    String? icon,
    String status,
    String runtimeMode,
    int? version,
    String? publishedVersionId,
    String? tenantId,
    String? createdBy,
    String? updatedBy,
    String createdAt,
    String updatedAt,
    String? systemPrompt,
    @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> nodes,
    @JsonKey(fromJson: _mapListFromJson) List<Map<String, dynamic>> edges,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? viewport,
    @JsonKey(fromJson: _nullableMapFromJson)
    Map<String, dynamic>? sandboxConfig,
    String? workspaceSnapshotId,
    @JsonKey(fromJson: _nullableMapFromJson) Map<String, dynamic>? inputSchema,
    @JsonKey(fromJson: _nullableStringListFromJson)
    List<String>? memoryInstanceIds,
    String? sandboxLifecycle,
    String? organizationId,
    String? modelId,
    String? autonomyMode,
    int? maxIterations,
    int? timeoutSeconds,
  });
}

/// @nodoc
class __$AgentDefinitionDtoCopyWithImpl<$Res>
    implements _$AgentDefinitionDtoCopyWith<$Res> {
  __$AgentDefinitionDtoCopyWithImpl(this._self, this._then);

  final _AgentDefinitionDto _self;
  final $Res Function(_AgentDefinitionDto) _then;

  /// Create a copy of AgentDefinitionDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? slug = null,
    Object? description = freezed,
    Object? icon = freezed,
    Object? status = null,
    Object? runtimeMode = null,
    Object? version = freezed,
    Object? publishedVersionId = freezed,
    Object? tenantId = freezed,
    Object? createdBy = freezed,
    Object? updatedBy = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? systemPrompt = freezed,
    Object? nodes = null,
    Object? edges = null,
    Object? viewport = freezed,
    Object? sandboxConfig = freezed,
    Object? workspaceSnapshotId = freezed,
    Object? inputSchema = freezed,
    Object? memoryInstanceIds = freezed,
    Object? sandboxLifecycle = freezed,
    Object? organizationId = freezed,
    Object? modelId = freezed,
    Object? autonomyMode = freezed,
    Object? maxIterations = freezed,
    Object? timeoutSeconds = freezed,
  }) {
    return _then(
      _AgentDefinitionDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _self.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        slug: null == slug
            ? _self.slug
            : slug // ignore: cast_nullable_to_non_nullable
                  as String,
        description: freezed == description
            ? _self.description
            : description // ignore: cast_nullable_to_non_nullable
                  as String?,
        icon: freezed == icon
            ? _self.icon
            : icon // ignore: cast_nullable_to_non_nullable
                  as String?,
        status: null == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String,
        runtimeMode: null == runtimeMode
            ? _self.runtimeMode
            : runtimeMode // ignore: cast_nullable_to_non_nullable
                  as String,
        version: freezed == version
            ? _self.version
            : version // ignore: cast_nullable_to_non_nullable
                  as int?,
        publishedVersionId: freezed == publishedVersionId
            ? _self.publishedVersionId
            : publishedVersionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        tenantId: freezed == tenantId
            ? _self.tenantId
            : tenantId // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdBy: freezed == createdBy
            ? _self.createdBy
            : createdBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        updatedBy: freezed == updatedBy
            ? _self.updatedBy
            : updatedBy // ignore: cast_nullable_to_non_nullable
                  as String?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
        updatedAt: null == updatedAt
            ? _self.updatedAt
            : updatedAt // ignore: cast_nullable_to_non_nullable
                  as String,
        systemPrompt: freezed == systemPrompt
            ? _self.systemPrompt
            : systemPrompt // ignore: cast_nullable_to_non_nullable
                  as String?,
        nodes: null == nodes
            ? _self._nodes
            : nodes // ignore: cast_nullable_to_non_nullable
                  as List<Map<String, dynamic>>,
        edges: null == edges
            ? _self._edges
            : edges // ignore: cast_nullable_to_non_nullable
                  as List<Map<String, dynamic>>,
        viewport: freezed == viewport
            ? _self._viewport
            : viewport // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        sandboxConfig: freezed == sandboxConfig
            ? _self._sandboxConfig
            : sandboxConfig // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        workspaceSnapshotId: freezed == workspaceSnapshotId
            ? _self.workspaceSnapshotId
            : workspaceSnapshotId // ignore: cast_nullable_to_non_nullable
                  as String?,
        inputSchema: freezed == inputSchema
            ? _self._inputSchema
            : inputSchema // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        memoryInstanceIds: freezed == memoryInstanceIds
            ? _self._memoryInstanceIds
            : memoryInstanceIds // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        sandboxLifecycle: freezed == sandboxLifecycle
            ? _self.sandboxLifecycle
            : sandboxLifecycle // ignore: cast_nullable_to_non_nullable
                  as String?,
        organizationId: freezed == organizationId
            ? _self.organizationId
            : organizationId // ignore: cast_nullable_to_non_nullable
                  as String?,
        modelId: freezed == modelId
            ? _self.modelId
            : modelId // ignore: cast_nullable_to_non_nullable
                  as String?,
        autonomyMode: freezed == autonomyMode
            ? _self.autonomyMode
            : autonomyMode // ignore: cast_nullable_to_non_nullable
                  as String?,
        maxIterations: freezed == maxIterations
            ? _self.maxIterations
            : maxIterations // ignore: cast_nullable_to_non_nullable
                  as int?,
        timeoutSeconds: freezed == timeoutSeconds
            ? _self.timeoutSeconds
            : timeoutSeconds // ignore: cast_nullable_to_non_nullable
                  as int?,
      ),
    );
  }
}
