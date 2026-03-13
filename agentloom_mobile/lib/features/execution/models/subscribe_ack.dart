import 'package:freezed_annotation/freezed_annotation.dart';
import 'execution_state.dart';

part 'subscribe_ack.freezed.dart';
part 'subscribe_ack.g.dart';

/// execution:subscribe ACK 响应
@freezed
abstract class SubscribeAck with _$SubscribeAck {
  const factory SubscribeAck({
    required String status,
    @JsonKey(name: 'current_state') ExecutionStateSnapshot? currentState,
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
