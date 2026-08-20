// ignore_for_file: invalid_annotation_target

import 'package:freezed_annotation/freezed_annotation.dart';
import 'execution_state.dart';

part 'subscribe_ack.freezed.dart';
part 'subscribe_ack.g.dart';

/// execution:subscribe ACK 响应
@freezed
abstract class SubscribeAck with _$SubscribeAck {
  // server 的 Socket 信封与载荷是 camelCase（见 agentloom-contracts），
  // 不能声明 FieldRename.snake，否则生成的解析代码会去读 event_id 之类的键。
  const factory SubscribeAck({
    required String status,
    ExecutionStateSnapshot? currentState,
    String? error,
  }) = _SubscribeAck;

  factory SubscribeAck.fromJson(Map<String, dynamic> json) =>
      _$SubscribeAckFromJson(json);
}

/// SubscribeAck 的便捷扩展
extension SubscribeAckX on SubscribeAck {
  bool get isSubscribed => status == 'subscribed';
  bool get isError => status == 'error';
}
