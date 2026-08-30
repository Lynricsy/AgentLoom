import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/execution_event.dart';
import '../models/execution_state.dart';
import '../models/subscribe_ack.dart';

/// Socket.IO 连接回调
typedef SocketCallback = void Function();
typedef SocketErrorCallback = void Function(dynamic error);
typedef SocketDisconnectCallback = void Function(String reason);

const List<String> _nativeSocketTransports = <String>['websocket'];
const List<String> _webSocketTransports = <String>['polling', 'websocket'];

String _stripApiSuffix(String path) {
  final normalizedPath = path.replaceFirst(RegExp(r'/$'), '');

  if (normalizedPath.isEmpty || normalizedPath == '/') {
    return '';
  }

  if (normalizedPath.endsWith('/api/v1')) {
    return normalizedPath.substring(
      0,
      normalizedPath.length - '/api/v1'.length,
    );
  }

  if (normalizedPath.endsWith('/api')) {
    return normalizedPath.substring(0, normalizedPath.length - '/api'.length);
  }

  return normalizedPath;
}

String resolveExecutionSocketUrl(String apiBaseUrl) {
  final resolvedApiUrl = Uri.parse(apiBaseUrl);
  final basePath = _stripApiSuffix(resolvedApiUrl.path);
  final namespacePath = '$basePath/execution'.replaceAll(RegExp(r'/+'), '/');
  return resolvedApiUrl.replace(path: namespacePath).toString();
}

Map<String, dynamic> buildSocketConnectionOptions({required String authToken}) {
  final builder = io.OptionBuilder()
      .setTransports(kIsWeb ? _webSocketTransports : _nativeSocketTransports)
      .setAuth({'token': authToken})
      .disableAutoConnect()
      .enableForceNew();

  if (!kIsWeb) {
    builder.setExtraHeaders({'Authorization': 'Bearer $authToken'});
  }

  // Flutter Web 本地调试经由反向代理时，direct websocket 握手可能返回 502；
  // 原生端则只使用 dart:io websocket，避免 polling/XHR 握手失败。
  return builder.build();
}

Map<String, dynamic>? coerceSocketJsonMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }

  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }

  return null;
}

/// Socket 事件解析失败的可观测记录。
class SocketParseFailure {
  const SocketParseFailure({
    required this.eventName,
    required this.reason,
    this.payloadKeys = const <String>[],
  });

  final String eventName;
  final String reason;
  final List<String> payloadKeys;

  @override
  String toString() =>
      'SocketParseFailure(event: $eventName, reason: $reason, keys: $payloadKeys)';
}

/// 执行监控 Socket.IO 服务
///
/// 管理与服务端 /execution namespace 的 WebSocket 连接，
/// 负责订阅/取消订阅、事件监听、断连重连回调。
class ExecutionSocketService {
  ExecutionSocketService({
    required String baseUrl,
    required String authToken,
    int ackTimeoutMs = 5000,
  }) : _baseUrl = baseUrl,
       _authToken = authToken,
       _ackTimeoutMs = ackTimeoutMs;

  final String _baseUrl;
  final String _authToken;
  final int _ackTimeoutMs;
  io.Socket? _socket;

  // 事件流控制器
  final _executionStatusChanged =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _nodeStatusChanged =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _stepAgentEvent = StreamController<ExecutionEventEnvelope>.broadcast();
  final _stepRetrying = StreamController<ExecutionEventEnvelope>.broadcast();
  final _outputChunk = StreamController<ExecutionEventEnvelope>.broadcast();
  final _interventionRequired =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _interventionResolved =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _toolCallStatusChanged =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _toolPermissionRequired =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _toolPermissionResolved =
      StreamController<ExecutionEventEnvelope>.broadcast();
  final _stateSnapshot = StreamController<ExecutionStateSnapshot>.broadcast();
  final _onConnected = StreamController<void>.broadcast();
  final _onDisconnected = StreamController<String>.broadcast();
  final _onReconnected = StreamController<void>.broadcast();
  final _onConnectError = StreamController<dynamic>.broadcast();

  /// 事件流
  Stream<ExecutionEventEnvelope> get executionStatusChanged =>
      _executionStatusChanged.stream;
  Stream<ExecutionEventEnvelope> get nodeStatusChanged =>
      _nodeStatusChanged.stream;
  Stream<ExecutionEventEnvelope> get stepAgentEvent => _stepAgentEvent.stream;
  Stream<ExecutionEventEnvelope> get stepRetrying => _stepRetrying.stream;
  Stream<ExecutionEventEnvelope> get outputChunk => _outputChunk.stream;
  Stream<ExecutionEventEnvelope> get interventionRequired =>
      _interventionRequired.stream;
  Stream<ExecutionEventEnvelope> get interventionResolved =>
      _interventionResolved.stream;
  Stream<ExecutionEventEnvelope> get toolCallStatusChanged =>
      _toolCallStatusChanged.stream;
  Stream<ExecutionEventEnvelope> get toolPermissionRequired =>
      _toolPermissionRequired.stream;
  Stream<ExecutionEventEnvelope> get toolPermissionResolved =>
      _toolPermissionResolved.stream;
  Stream<ExecutionStateSnapshot> get stateSnapshot => _stateSnapshot.stream;
  Stream<void> get onConnected => _onConnected.stream;
  Stream<String> get onDisconnected => _onDisconnected.stream;
  Stream<void> get onReconnected => _onReconnected.stream;
  Stream<dynamic> get onConnectError => _onConnectError.stream;

  /// 是否已连接
  bool get isConnected => _socket?.connected ?? false;

  int _parseFailureCount = 0;
  SocketParseFailure? _lastParseFailure;

  /// 累计事件解析失败次数。非 0 说明服务端 wire 格式与本端模型已漂移。
  int get parseFailureCount => _parseFailureCount;

  /// 最近一次解析失败的详情，供诊断使用。
  SocketParseFailure? get lastParseFailure => _lastParseFailure;

  /// 连接到服务端 /execution namespace
  void connect() {
    if (_socket != null) return;

    _socket = io.io(
      resolveExecutionSocketUrl(_baseUrl),
      buildSocketConnectionOptions(authToken: _authToken),
    );

    _setupEventListeners();
    _socket!.connect();
  }

  void _setupEventListeners() {
    final socket = _socket!;

    // 连接生命周期
    socket.onConnect((_) {
      _onConnected.add(null);
    });

    socket.onDisconnect((reason) {
      _onDisconnected.add(reason?.toString() ?? 'unknown');
    });

    socket.onReconnect((_) {
      _onReconnected.add(null);
    });

    socket.onConnectError((error) {
      _onConnectError.add(error);
    });

    // 业务事件
    _bindEnvelopeEvent(
      socket,
      'execution.status.changed',
      _executionStatusChanged,
    );
    _bindEnvelopeEvent(socket, 'execution.node.status-changed', _nodeStatusChanged);
    _bindEnvelopeEvent(socket, 'execution.node.agent-event', _stepAgentEvent);
    _bindEnvelopeEvent(socket, 'execution.node.retrying', _stepRetrying);
    _bindEnvelopeEvent(socket, 'execution.node.output-chunk', _outputChunk);
    _bindEnvelopeEvent(
      socket,
      'execution.node.intervention-required',
      _interventionRequired,
    );
    _bindEnvelopeEvent(
      socket,
      'execution.node.intervention-resolved',
      _interventionResolved,
    );
    _bindEnvelopeEvent(
      socket,
      'execution.node.tool-call-status',
      _toolCallStatusChanged,
    );
    _bindEnvelopeEvent(
      socket,
      'execution.node.tool-permission-required',
      _toolPermissionRequired,
    );
    _bindEnvelopeEvent(
      socket,
      'execution.node.tool-permission-resolved',
      _toolPermissionResolved,
    );

    socket.on('execution.state.snapshot', (data) {
      _decodeAndEmit(
        eventName: 'execution.state.snapshot',
        data: data,
        decode: ExecutionStateSnapshot.fromJson,
        sink: _stateSnapshot,
      );
    });
  }

  /// 把一个 camelCase 事件信封绑定到对应的流。
  void _bindEnvelopeEvent(
    io.Socket socket,
    String eventName,
    StreamController<ExecutionEventEnvelope> sink,
  ) {
    socket.on(eventName, (data) {
      _decodeAndEmit(
        eventName: eventName,
        data: data,
        decode: ExecutionEventEnvelope.fromJson,
        sink: sink,
      );
    });
  }

  /// 解析并投递事件载荷。
  ///
  /// 解析失败不再静默丢弃：累加 [parseFailureCount]、记录最近一次失败详情，
  /// 并在 debug 构建下打印结构化错误，便于定位契约漂移。
  void _decodeAndEmit<T>({
    required String eventName,
    required Object? data,
    required T Function(Map<String, dynamic>) decode,
    required StreamController<T> sink,
  }) {
    final payload = coerceSocketJsonMap(data);

    if (payload == null) {
      _recordParseFailure(
        eventName,
        'payload 不是 JSON 对象：${data.runtimeType}',
      );
      return;
    }

    try {
      sink.add(decode(payload));
    } catch (error, stackTrace) {
      _recordParseFailure(
        eventName,
        error.toString(),
        keys: payload.keys.toList(growable: false),
        stackTrace: stackTrace,
      );
    }
  }

  void _recordParseFailure(
    String eventName,
    String reason, {
    List<String>? keys,
    StackTrace? stackTrace,
  }) {
    _parseFailureCount += 1;
    _lastParseFailure = SocketParseFailure(
      eventName: eventName,
      reason: reason,
      payloadKeys: keys ?? const <String>[],
    );

    assert(() {
      debugPrint(
        '[ExecutionSocketService] 事件 $eventName 解析失败（累计 $_parseFailureCount 次）：'
        '$reason；载荷键=${keys ?? const <String>[]}',
      );
      if (stackTrace != null) {
        debugPrintStack(stackTrace: stackTrace, maxFrames: 8);
      }
      return true;
    }());
  }

  /// 订阅执行事件，返回 SubscribeAck
  Future<SubscribeAck> subscribe({
    required String executionId,
    String? tenantId,
    int? lastEventId,
  }) async {
    if (_socket == null || !_socket!.connected) {
      return const SubscribeAck(status: 'error', error: 'NOT_CONNECTED');
    }

    final payload = <String, dynamic>{
      'executionId': executionId,
      'tenantId': ?tenantId,
      'lastEventId': ?lastEventId,
    };

    try {
      final result = await _socket!
          .emitWithAckAsync('execution:subscribe', payload)
          .timeout(Duration(milliseconds: _ackTimeoutMs));

      final ack = coerceSocketJsonMap(result);
      if (ack != null) {
        return SubscribeAck.fromJson(ack);
      }
      return const SubscribeAck(status: 'error', error: 'INVALID_RESPONSE');
    } on TimeoutException {
      return const SubscribeAck(status: 'error', error: 'TIMEOUT');
    } catch (e) {
      return SubscribeAck(status: 'error', error: e.toString());
    }
  }

  /// 取消订阅执行事件
  void unsubscribe({required String executionId, String? tenantId}) {
    if (_socket == null || !_socket!.connected) return;

    _socket!.emit('execution:unsubscribe', {
      'executionId': executionId,
      'tenantId': ?tenantId,
    });
  }

  /// 断开连接并释放资源
  void dispose() {
    _socket?.dispose();
    _socket = null;
    _executionStatusChanged.close();
    _nodeStatusChanged.close();
    _stepAgentEvent.close();
    _stepRetrying.close();
    _outputChunk.close();
    _interventionRequired.close();
    _interventionResolved.close();
    _toolCallStatusChanged.close();
    _toolPermissionRequired.close();
    _toolPermissionResolved.close();
    _stateSnapshot.close();
    _onConnected.close();
    _onDisconnected.close();
    _onReconnected.close();
    _onConnectError.close();
  }
}

/// ExecutionSocketService provider
final executionSocketServiceProvider =
    Provider.family<
      ExecutionSocketService,
      ({String baseUrl, String authToken})
    >((ref, params) {
      final service = ExecutionSocketService(
        baseUrl: params.baseUrl,
        authToken: params.authToken,
      );
      ref.onDispose(service.dispose);
      return service;
    });
