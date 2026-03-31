// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_notification_payload.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PushNotificationPayload _$PushNotificationPayloadFromJson(
  Map<String, dynamic> json,
) => _PushNotificationPayload(
  type: json['type'] as String,
  executionId: json['executionId'] as String?,
  workflowId: json['workflowId'] as String?,
  nodeId: json['nodeId'] as String?,
  notificationId: json['notificationId'] as String?,
);

Map<String, dynamic> _$PushNotificationPayloadToJson(
  _PushNotificationPayload instance,
) => <String, dynamic>{
  'type': instance.type,
  'executionId': instance.executionId,
  'workflowId': instance.workflowId,
  'nodeId': instance.nodeId,
  'notificationId': instance.notificationId,
};
