// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_notification_payload.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PushNotificationPayload _$PushNotificationPayloadFromJson(
  Map<String, dynamic> json,
) => _PushNotificationPayload(
  type: json['type'] as String,
  executionId: json['execution_id'] as String?,
  workflowId: json['workflow_id'] as String?,
  nodeId: json['node_id'] as String?,
  notificationId: json['notification_id'] as String?,
);

Map<String, dynamic> _$PushNotificationPayloadToJson(
  _PushNotificationPayload instance,
) => <String, dynamic>{
  'type': instance.type,
  'execution_id': instance.executionId,
  'workflow_id': instance.workflowId,
  'node_id': instance.nodeId,
  'notification_id': instance.notificationId,
};
