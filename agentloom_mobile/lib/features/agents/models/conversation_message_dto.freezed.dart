// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'conversation_message_dto.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ConversationMessageDto {
  String get id;
  @JsonKey(name: 'conversation_id')
  String get conversationId;
  MessageRole get role;
  MessageType get type;
  String get content;
  @JsonKey(name: 'tool_name')
  String? get toolName;
  @JsonKey(name: 'tool_input')
  Map<String, dynamic>? get toolInput;
  @JsonKey(name: 'tool_output')
  String? get toolOutput;
  List<String>? get attachments;
  @JsonKey(name: 'created_at')
  String get createdAt;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ConversationMessageDtoCopyWith<ConversationMessageDto> get copyWith =>
      _$ConversationMessageDtoCopyWithImpl<ConversationMessageDto>(
        this as ConversationMessageDto,
        _$identity,
      );

  /// Serializes this ConversationMessageDto to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ConversationMessageDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.conversationId, conversationId) ||
                other.conversationId == conversationId) &&
            (identical(other.role, role) || other.role == role) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            const DeepCollectionEquality().equals(other.toolInput, toolInput) &&
            (identical(other.toolOutput, toolOutput) ||
                other.toolOutput == toolOutput) &&
            const DeepCollectionEquality().equals(
              other.attachments,
              attachments,
            ) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    conversationId,
    role,
    type,
    content,
    toolName,
    const DeepCollectionEquality().hash(toolInput),
    toolOutput,
    const DeepCollectionEquality().hash(attachments),
    createdAt,
  );

  @override
  String toString() {
    return 'ConversationMessageDto(id: $id, conversationId: $conversationId, role: $role, type: $type, content: $content, toolName: $toolName, toolInput: $toolInput, toolOutput: $toolOutput, attachments: $attachments, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class $ConversationMessageDtoCopyWith<$Res> {
  factory $ConversationMessageDtoCopyWith(
    ConversationMessageDto value,
    $Res Function(ConversationMessageDto) _then,
  ) = _$ConversationMessageDtoCopyWithImpl;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'conversation_id') String conversationId,
    MessageRole role,
    MessageType type,
    String content,
    @JsonKey(name: 'tool_name') String? toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    @JsonKey(name: 'tool_output') String? toolOutput,
    List<String>? attachments,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class _$ConversationMessageDtoCopyWithImpl<$Res>
    implements $ConversationMessageDtoCopyWith<$Res> {
  _$ConversationMessageDtoCopyWithImpl(this._self, this._then);

  final ConversationMessageDto _self;
  final $Res Function(ConversationMessageDto) _then;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? conversationId = null,
    Object? role = null,
    Object? type = null,
    Object? content = null,
    Object? toolName = freezed,
    Object? toolInput = freezed,
    Object? toolOutput = freezed,
    Object? attachments = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _self.copyWith(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        conversationId: null == conversationId
            ? _self.conversationId
            : conversationId // ignore: cast_nullable_to_non_nullable
                  as String,
        role: null == role
            ? _self.role
            : role // ignore: cast_nullable_to_non_nullable
                  as MessageRole,
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as MessageType,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        toolName: freezed == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String?,
        toolInput: freezed == toolInput
            ? _self.toolInput
            : toolInput // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        toolOutput: freezed == toolOutput
            ? _self.toolOutput
            : toolOutput // ignore: cast_nullable_to_non_nullable
                  as String?,
        attachments: freezed == attachments
            ? _self.attachments
            : attachments // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ConversationMessageDto].
extension ConversationMessageDtoPatterns on ConversationMessageDto {
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
    TResult Function(_ConversationMessageDto value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
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
    TResult Function(_ConversationMessageDto value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto():
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
    TResult? Function(_ConversationMessageDto value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
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
      @JsonKey(name: 'conversation_id') String conversationId,
      MessageRole role,
      MessageType type,
      String content,
      @JsonKey(name: 'tool_name') String? toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      @JsonKey(name: 'tool_output') String? toolOutput,
      List<String>? attachments,
      @JsonKey(name: 'created_at') String createdAt,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.type,
          _that.content,
          _that.toolName,
          _that.toolInput,
          _that.toolOutput,
          _that.attachments,
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
      @JsonKey(name: 'conversation_id') String conversationId,
      MessageRole role,
      MessageType type,
      String content,
      @JsonKey(name: 'tool_name') String? toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      @JsonKey(name: 'tool_output') String? toolOutput,
      List<String>? attachments,
      @JsonKey(name: 'created_at') String createdAt,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto():
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.type,
          _that.content,
          _that.toolName,
          _that.toolInput,
          _that.toolOutput,
          _that.attachments,
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
      @JsonKey(name: 'conversation_id') String conversationId,
      MessageRole role,
      MessageType type,
      String content,
      @JsonKey(name: 'tool_name') String? toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      @JsonKey(name: 'tool_output') String? toolOutput,
      List<String>? attachments,
      @JsonKey(name: 'created_at') String createdAt,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ConversationMessageDto() when $default != null:
        return $default(
          _that.id,
          _that.conversationId,
          _that.role,
          _that.type,
          _that.content,
          _that.toolName,
          _that.toolInput,
          _that.toolOutput,
          _that.attachments,
          _that.createdAt,
        );
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ConversationMessageDto implements ConversationMessageDto {
  const _ConversationMessageDto({
    required this.id,
    @JsonKey(name: 'conversation_id') required this.conversationId,
    required this.role,
    this.type = MessageType.text,
    required this.content,
    @JsonKey(name: 'tool_name') this.toolName,
    @JsonKey(name: 'tool_input') final Map<String, dynamic>? toolInput,
    @JsonKey(name: 'tool_output') this.toolOutput,
    final List<String>? attachments,
    @JsonKey(name: 'created_at') required this.createdAt,
  }) : _toolInput = toolInput,
       _attachments = attachments;
  factory _ConversationMessageDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationMessageDtoFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'conversation_id')
  final String conversationId;
  @override
  final MessageRole role;
  @override
  @JsonKey()
  final MessageType type;
  @override
  final String content;
  @override
  @JsonKey(name: 'tool_name')
  final String? toolName;
  final Map<String, dynamic>? _toolInput;
  @override
  @JsonKey(name: 'tool_input')
  Map<String, dynamic>? get toolInput {
    final value = _toolInput;
    if (value == null) return null;
    if (_toolInput is EqualUnmodifiableMapView) return _toolInput;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey(name: 'tool_output')
  final String? toolOutput;
  final List<String>? _attachments;
  @override
  List<String>? get attachments {
    final value = _attachments;
    if (value == null) return null;
    if (_attachments is EqualUnmodifiableListView) return _attachments;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  @JsonKey(name: 'created_at')
  final String createdAt;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ConversationMessageDtoCopyWith<_ConversationMessageDto> get copyWith =>
      __$ConversationMessageDtoCopyWithImpl<_ConversationMessageDto>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$ConversationMessageDtoToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ConversationMessageDto &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.conversationId, conversationId) ||
                other.conversationId == conversationId) &&
            (identical(other.role, role) || other.role == role) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            const DeepCollectionEquality().equals(
              other._toolInput,
              _toolInput,
            ) &&
            (identical(other.toolOutput, toolOutput) ||
                other.toolOutput == toolOutput) &&
            const DeepCollectionEquality().equals(
              other._attachments,
              _attachments,
            ) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    conversationId,
    role,
    type,
    content,
    toolName,
    const DeepCollectionEquality().hash(_toolInput),
    toolOutput,
    const DeepCollectionEquality().hash(_attachments),
    createdAt,
  );

  @override
  String toString() {
    return 'ConversationMessageDto(id: $id, conversationId: $conversationId, role: $role, type: $type, content: $content, toolName: $toolName, toolInput: $toolInput, toolOutput: $toolOutput, attachments: $attachments, createdAt: $createdAt)';
  }
}

/// @nodoc
abstract mixin class _$ConversationMessageDtoCopyWith<$Res>
    implements $ConversationMessageDtoCopyWith<$Res> {
  factory _$ConversationMessageDtoCopyWith(
    _ConversationMessageDto value,
    $Res Function(_ConversationMessageDto) _then,
  ) = __$ConversationMessageDtoCopyWithImpl;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'conversation_id') String conversationId,
    MessageRole role,
    MessageType type,
    String content,
    @JsonKey(name: 'tool_name') String? toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    @JsonKey(name: 'tool_output') String? toolOutput,
    List<String>? attachments,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class __$ConversationMessageDtoCopyWithImpl<$Res>
    implements _$ConversationMessageDtoCopyWith<$Res> {
  __$ConversationMessageDtoCopyWithImpl(this._self, this._then);

  final _ConversationMessageDto _self;
  final $Res Function(_ConversationMessageDto) _then;

  /// Create a copy of ConversationMessageDto
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? id = null,
    Object? conversationId = null,
    Object? role = null,
    Object? type = null,
    Object? content = null,
    Object? toolName = freezed,
    Object? toolInput = freezed,
    Object? toolOutput = freezed,
    Object? attachments = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _ConversationMessageDto(
        id: null == id
            ? _self.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        conversationId: null == conversationId
            ? _self.conversationId
            : conversationId // ignore: cast_nullable_to_non_nullable
                  as String,
        role: null == role
            ? _self.role
            : role // ignore: cast_nullable_to_non_nullable
                  as MessageRole,
        type: null == type
            ? _self.type
            : type // ignore: cast_nullable_to_non_nullable
                  as MessageType,
        content: null == content
            ? _self.content
            : content // ignore: cast_nullable_to_non_nullable
                  as String,
        toolName: freezed == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String?,
        toolInput: freezed == toolInput
            ? _self._toolInput
            : toolInput // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        toolOutput: freezed == toolOutput
            ? _self.toolOutput
            : toolOutput // ignore: cast_nullable_to_non_nullable
                  as String?,
        attachments: freezed == attachments
            ? _self._attachments
            : attachments // ignore: cast_nullable_to_non_nullable
                  as List<String>?,
        createdAt: null == createdAt
            ? _self.createdAt
            : createdAt // ignore: cast_nullable_to_non_nullable
                  as String,
      ),
    );
  }
}

/// @nodoc
mixin _$TerminalOutputData {
  @JsonKey(name: 'session_id')
  String? get sessionId;
  String get output;
  @JsonKey(name: 'is_error')
  bool get isError;

  /// Create a copy of TerminalOutputData
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $TerminalOutputDataCopyWith<TerminalOutputData> get copyWith =>
      _$TerminalOutputDataCopyWithImpl<TerminalOutputData>(
        this as TerminalOutputData,
        _$identity,
      );

  /// Serializes this TerminalOutputData to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is TerminalOutputData &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.output, output) || other.output == output) &&
            (identical(other.isError, isError) || other.isError == isError));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, sessionId, output, isError);

  @override
  String toString() {
    return 'TerminalOutputData(sessionId: $sessionId, output: $output, isError: $isError)';
  }
}

/// @nodoc
abstract mixin class $TerminalOutputDataCopyWith<$Res> {
  factory $TerminalOutputDataCopyWith(
    TerminalOutputData value,
    $Res Function(TerminalOutputData) _then,
  ) = _$TerminalOutputDataCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(name: 'session_id') String? sessionId,
    String output,
    @JsonKey(name: 'is_error') bool isError,
  });
}

/// @nodoc
class _$TerminalOutputDataCopyWithImpl<$Res>
    implements $TerminalOutputDataCopyWith<$Res> {
  _$TerminalOutputDataCopyWithImpl(this._self, this._then);

  final TerminalOutputData _self;
  final $Res Function(TerminalOutputData) _then;

  /// Create a copy of TerminalOutputData
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? sessionId = freezed,
    Object? output = null,
    Object? isError = null,
  }) {
    return _then(
      _self.copyWith(
        sessionId: freezed == sessionId
            ? _self.sessionId
            : sessionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        output: null == output
            ? _self.output
            : output // ignore: cast_nullable_to_non_nullable
                  as String,
        isError: null == isError
            ? _self.isError
            : isError // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [TerminalOutputData].
extension TerminalOutputDataPatterns on TerminalOutputData {
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
    TResult Function(_TerminalOutputData value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData() when $default != null:
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
    TResult Function(_TerminalOutputData value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData():
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
    TResult? Function(_TerminalOutputData value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData() when $default != null:
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
      @JsonKey(name: 'session_id') String? sessionId,
      String output,
      @JsonKey(name: 'is_error') bool isError,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData() when $default != null:
        return $default(_that.sessionId, _that.output, _that.isError);
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
      @JsonKey(name: 'session_id') String? sessionId,
      String output,
      @JsonKey(name: 'is_error') bool isError,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData():
        return $default(_that.sessionId, _that.output, _that.isError);
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
      @JsonKey(name: 'session_id') String? sessionId,
      String output,
      @JsonKey(name: 'is_error') bool isError,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _TerminalOutputData() when $default != null:
        return $default(_that.sessionId, _that.output, _that.isError);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _TerminalOutputData implements TerminalOutputData {
  const _TerminalOutputData({
    @JsonKey(name: 'session_id') this.sessionId,
    required this.output,
    @JsonKey(name: 'is_error') this.isError = false,
  });
  factory _TerminalOutputData.fromJson(Map<String, dynamic> json) =>
      _$TerminalOutputDataFromJson(json);

  @override
  @JsonKey(name: 'session_id')
  final String? sessionId;
  @override
  final String output;
  @override
  @JsonKey(name: 'is_error')
  final bool isError;

  /// Create a copy of TerminalOutputData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$TerminalOutputDataCopyWith<_TerminalOutputData> get copyWith =>
      __$TerminalOutputDataCopyWithImpl<_TerminalOutputData>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$TerminalOutputDataToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _TerminalOutputData &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.output, output) || other.output == output) &&
            (identical(other.isError, isError) || other.isError == isError));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, sessionId, output, isError);

  @override
  String toString() {
    return 'TerminalOutputData(sessionId: $sessionId, output: $output, isError: $isError)';
  }
}

/// @nodoc
abstract mixin class _$TerminalOutputDataCopyWith<$Res>
    implements $TerminalOutputDataCopyWith<$Res> {
  factory _$TerminalOutputDataCopyWith(
    _TerminalOutputData value,
    $Res Function(_TerminalOutputData) _then,
  ) = __$TerminalOutputDataCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'session_id') String? sessionId,
    String output,
    @JsonKey(name: 'is_error') bool isError,
  });
}

/// @nodoc
class __$TerminalOutputDataCopyWithImpl<$Res>
    implements _$TerminalOutputDataCopyWith<$Res> {
  __$TerminalOutputDataCopyWithImpl(this._self, this._then);

  final _TerminalOutputData _self;
  final $Res Function(_TerminalOutputData) _then;

  /// Create a copy of TerminalOutputData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? sessionId = freezed,
    Object? output = null,
    Object? isError = null,
  }) {
    return _then(
      _TerminalOutputData(
        sessionId: freezed == sessionId
            ? _self.sessionId
            : sessionId // ignore: cast_nullable_to_non_nullable
                  as String?,
        output: null == output
            ? _self.output
            : output // ignore: cast_nullable_to_non_nullable
                  as String,
        isError: null == isError
            ? _self.isError
            : isError // ignore: cast_nullable_to_non_nullable
                  as bool,
      ),
    );
  }
}

/// @nodoc
mixin _$ToolCallEventData {
  @JsonKey(name: 'tool_name')
  String get toolName;
  @JsonKey(name: 'tool_input')
  Map<String, dynamic>? get toolInput;
  String? get status;

  /// Create a copy of ToolCallEventData
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  $ToolCallEventDataCopyWith<ToolCallEventData> get copyWith =>
      _$ToolCallEventDataCopyWithImpl<ToolCallEventData>(
        this as ToolCallEventData,
        _$identity,
      );

  /// Serializes this ToolCallEventData to a JSON map.
  Map<String, dynamic> toJson();

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is ToolCallEventData &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            const DeepCollectionEquality().equals(other.toolInput, toolInput) &&
            (identical(other.status, status) || other.status == status));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolName,
    const DeepCollectionEquality().hash(toolInput),
    status,
  );

  @override
  String toString() {
    return 'ToolCallEventData(toolName: $toolName, toolInput: $toolInput, status: $status)';
  }
}

/// @nodoc
abstract mixin class $ToolCallEventDataCopyWith<$Res> {
  factory $ToolCallEventDataCopyWith(
    ToolCallEventData value,
    $Res Function(ToolCallEventData) _then,
  ) = _$ToolCallEventDataCopyWithImpl;
  @useResult
  $Res call({
    @JsonKey(name: 'tool_name') String toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    String? status,
  });
}

/// @nodoc
class _$ToolCallEventDataCopyWithImpl<$Res>
    implements $ToolCallEventDataCopyWith<$Res> {
  _$ToolCallEventDataCopyWithImpl(this._self, this._then);

  final ToolCallEventData _self;
  final $Res Function(ToolCallEventData) _then;

  /// Create a copy of ToolCallEventData
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? toolName = null,
    Object? toolInput = freezed,
    Object? status = freezed,
  }) {
    return _then(
      _self.copyWith(
        toolName: null == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String,
        toolInput: freezed == toolInput
            ? _self.toolInput
            : toolInput // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}

/// Adds pattern-matching-related methods to [ToolCallEventData].
extension ToolCallEventDataPatterns on ToolCallEventData {
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
    TResult Function(_ToolCallEventData value)? $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData() when $default != null:
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
    TResult Function(_ToolCallEventData value) $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData():
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
    TResult? Function(_ToolCallEventData value)? $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData() when $default != null:
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
      @JsonKey(name: 'tool_name') String toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      String? status,
    )?
    $default, {
    required TResult orElse(),
  }) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData() when $default != null:
        return $default(_that.toolName, _that.toolInput, _that.status);
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
      @JsonKey(name: 'tool_name') String toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      String? status,
    )
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData():
        return $default(_that.toolName, _that.toolInput, _that.status);
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
      @JsonKey(name: 'tool_name') String toolName,
      @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
      String? status,
    )?
    $default,
  ) {
    final _that = this;
    switch (_that) {
      case _ToolCallEventData() when $default != null:
        return $default(_that.toolName, _that.toolInput, _that.status);
      case _:
        return null;
    }
  }
}

/// @nodoc
@JsonSerializable()
class _ToolCallEventData implements ToolCallEventData {
  const _ToolCallEventData({
    @JsonKey(name: 'tool_name') required this.toolName,
    @JsonKey(name: 'tool_input') final Map<String, dynamic>? toolInput,
    this.status,
  }) : _toolInput = toolInput;
  factory _ToolCallEventData.fromJson(Map<String, dynamic> json) =>
      _$ToolCallEventDataFromJson(json);

  @override
  @JsonKey(name: 'tool_name')
  final String toolName;
  final Map<String, dynamic>? _toolInput;
  @override
  @JsonKey(name: 'tool_input')
  Map<String, dynamic>? get toolInput {
    final value = _toolInput;
    if (value == null) return null;
    if (_toolInput is EqualUnmodifiableMapView) return _toolInput;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  final String? status;

  /// Create a copy of ToolCallEventData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  @pragma('vm:prefer-inline')
  _$ToolCallEventDataCopyWith<_ToolCallEventData> get copyWith =>
      __$ToolCallEventDataCopyWithImpl<_ToolCallEventData>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$ToolCallEventDataToJson(this);
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _ToolCallEventData &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            const DeepCollectionEquality().equals(
              other._toolInput,
              _toolInput,
            ) &&
            (identical(other.status, status) || other.status == status));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    toolName,
    const DeepCollectionEquality().hash(_toolInput),
    status,
  );

  @override
  String toString() {
    return 'ToolCallEventData(toolName: $toolName, toolInput: $toolInput, status: $status)';
  }
}

/// @nodoc
abstract mixin class _$ToolCallEventDataCopyWith<$Res>
    implements $ToolCallEventDataCopyWith<$Res> {
  factory _$ToolCallEventDataCopyWith(
    _ToolCallEventData value,
    $Res Function(_ToolCallEventData) _then,
  ) = __$ToolCallEventDataCopyWithImpl;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'tool_name') String toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    String? status,
  });
}

/// @nodoc
class __$ToolCallEventDataCopyWithImpl<$Res>
    implements _$ToolCallEventDataCopyWith<$Res> {
  __$ToolCallEventDataCopyWithImpl(this._self, this._then);

  final _ToolCallEventData _self;
  final $Res Function(_ToolCallEventData) _then;

  /// Create a copy of ToolCallEventData
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $Res call({
    Object? toolName = null,
    Object? toolInput = freezed,
    Object? status = freezed,
  }) {
    return _then(
      _ToolCallEventData(
        toolName: null == toolName
            ? _self.toolName
            : toolName // ignore: cast_nullable_to_non_nullable
                  as String,
        toolInput: freezed == toolInput
            ? _self._toolInput
            : toolInput // ignore: cast_nullable_to_non_nullable
                  as Map<String, dynamic>?,
        status: freezed == status
            ? _self.status
            : status // ignore: cast_nullable_to_non_nullable
                  as String?,
      ),
    );
  }
}
