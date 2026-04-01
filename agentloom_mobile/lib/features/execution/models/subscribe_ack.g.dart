// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscribe_ack.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SubscribeAck _$SubscribeAckFromJson(Map<String, dynamic> json) =>
    _SubscribeAck(
      status: json['status'] as String,
      currentState: json['current_state'] == null
          ? null
          : ExecutionStateSnapshot.fromJson(
              json['current_state'] as Map<String, dynamic>,
            ),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$SubscribeAckToJson(_SubscribeAck instance) =>
    <String, dynamic>{
      'status': instance.status,
      'current_state': instance.currentState?.toJson(),
      'error': instance.error,
    };
