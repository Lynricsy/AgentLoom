// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscribe_ack.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SubscribeAck _$SubscribeAckFromJson(Map<String, dynamic> json) =>
    _SubscribeAck(
      status: json['status'] as String,
      currentState: json['currentState'] == null
          ? null
          : ExecutionStateSnapshot.fromJson(
              json['currentState'] as Map<String, dynamic>,
            ),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$SubscribeAckToJson(_SubscribeAck instance) =>
    <String, dynamic>{
      'status': instance.status,
      'currentState': instance.currentState?.toJson(),
      'error': instance.error,
    };
