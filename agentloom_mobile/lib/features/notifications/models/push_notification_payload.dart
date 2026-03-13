import 'package:freezed_annotation/freezed_annotation.dart';

part 'push_notification_payload.freezed.dart';
part 'push_notification_payload.g.dart';

@freezed
abstract class PushNotificationPayload with _$PushNotificationPayload {
  const factory PushNotificationPayload({
    required String type,
    @JsonKey(name: 'execution_id') String? executionId,
    @JsonKey(name: 'workflow_id') String? workflowId,
    @JsonKey(name: 'node_id') String? nodeId,
    @JsonKey(name: 'notification_id') String? notificationId,
  }) = _PushNotificationPayload;

  factory PushNotificationPayload.fromJson(Map<String, dynamic> json) =>
      _$PushNotificationPayloadFromJson(json);

  /// 从 FCM `RemoteMessage.data` 解析推送载荷。
  factory PushNotificationPayload.fromFcmData(Map<String, dynamic> data) {
    String? readString(String key) {
      final value = data[key];
      return value?.toString();
    }

    return PushNotificationPayload(
      type: readString('type') ?? 'unknown',
      executionId: readString('executionId'),
      workflowId: readString('workflowId'),
      nodeId: readString('nodeId'),
      notificationId: readString('notificationId'),
    );
  }
}
