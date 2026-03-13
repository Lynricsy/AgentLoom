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
      '$_baseUrl/execution',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': _authToken})
          .disableAutoConnect()
          .enableForceNew()
          .build(),
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
      if (data is Map<String, dynamic>) {
        try {
          _executionStatusChanged.add(ExecutionEventEnvelope.fromJson(data));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.node.status-changed', (data) {
      if (data is Map<String, dynamic>) {
        try {
          _nodeStatusChanged.add(ExecutionEventEnvelope.fromJson(data));
        } catch (_) {
          // 解析失败则忽略
        }
      }
    });

    socket.on('execution.state.snapshot', (data) {
      if (data is Map<String, dynamic>) {
        try {
          _stateSnapshot.add(ExecutionStateSnapshot.fromJson(data));
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

      if (result is Map<String, dynamic>) {
        return SubscribeAck.fromJson(result);
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
