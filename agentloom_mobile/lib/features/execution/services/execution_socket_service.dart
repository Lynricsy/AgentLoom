import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/execution_event.dart';
import '../models/execution_state.dart';
import '../models/subscribe_ack.dart';

/// Socket.IO 连接回调
typedef SocketCallback = void Function();
typedef SocketErrorCallback = void Function(dynamic error);
typedef SocketDisconnectCallback = void Function(String reason);

const List<String> _defaultSocketTransports = <String>['polling', 'websocket'];

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
  // Flutter Web 本地调试经由反向代理时，direct websocket 握手可能返回 502；
  // 保留 polling -> websocket 升级链路，避免实时页直接白屏。
  return io.OptionBuilder()
      .setTransports(_defaultSocketTransports)
      .setAuth({'token': authToken})
      .disableAutoConnect()
      .enableForceNew()
      .build();
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
    socket.on('execution.status.changed', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _executionStatusChanged.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.status-changed', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _nodeStatusChanged.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.agent-event', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _stepAgentEvent.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.retrying', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _stepRetrying.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.output-chunk', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _outputChunk.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.intervention-required', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _interventionRequired.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.intervention-resolved', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _interventionResolved.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.tool-call-status', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _toolCallStatusChanged.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.tool-permission-required', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _toolPermissionRequired.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.tool-permission-resolved', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _toolPermissionResolved.add(ExecutionEventEnvelope.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.state.snapshot', (data) {
      final payload = coerceSocketJsonMap(data);
      if (payload != null) {
        try {
          _stateSnapshot.add(ExecutionStateSnapshot.fromJson(payload));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });
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
      if (tenantId != null) 'tenantId': tenantId,
      if (lastEventId != null) 'lastEventId': lastEventId,
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
      if (tenantId != null) 'tenantId': tenantId,
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
