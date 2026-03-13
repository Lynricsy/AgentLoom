import 'package:flutter_test/flutter_test.dart';
import 'package:agentloom_mobile/features/execution/models/execution_status.dart';
import 'package:flutter/material.dart';

void main() {
  group('ExecutionStatus', () {
    test('fromJson 解析有效状态', () {
      expect(ExecutionStatus.fromJson('pending'), ExecutionStatus.pending);
      expect(ExecutionStatus.fromJson('running'), ExecutionStatus.running);
      expect(ExecutionStatus.fromJson('paused'), ExecutionStatus.paused);
      expect(ExecutionStatus.fromJson('completed'), ExecutionStatus.completed);
      expect(ExecutionStatus.fromJson('failed'), ExecutionStatus.failed);
      expect(ExecutionStatus.fromJson('cancelled'), ExecutionStatus.cancelled);
    });

    test('fromJson 未知状态回退到 pending', () {
      expect(ExecutionStatus.fromJson('unknown'), ExecutionStatus.pending);
      expect(ExecutionStatus.fromJson(''), ExecutionStatus.pending);
    });

    test('toJson 返回状态名', () {
      expect(ExecutionStatus.running.toJson(), 'running');
      expect(ExecutionStatus.completed.toJson(), 'completed');
    });

    test('isTerminal 正确判断终态', () {
      expect(ExecutionStatus.pending.isTerminal, isFalse);
      expect(ExecutionStatus.running.isTerminal, isFalse);
      expect(ExecutionStatus.paused.isTerminal, isFalse);
      expect(ExecutionStatus.completed.isTerminal, isTrue);
      expect(ExecutionStatus.failed.isTerminal, isTrue);
      expect(ExecutionStatus.cancelled.isTerminal, isTrue);
    });

    test('color 返回正确颜色', () {
      expect(ExecutionStatus.pending.color, Colors.grey);
      expect(ExecutionStatus.running.color, Colors.blue);
      expect(ExecutionStatus.paused.color, Colors.amber);
      expect(ExecutionStatus.completed.color, Colors.green);
      expect(ExecutionStatus.failed.color, Colors.red);
      expect(ExecutionStatus.cancelled.color, Colors.orange);
    });

    test('label 返回正确显示文本', () {
      expect(ExecutionStatus.running.label, 'Running');
      expect(ExecutionStatus.completed.label, 'Completed');
      expect(ExecutionStatus.failed.label, 'Failed');
    });

    test('icon 返回正确图标', () {
      expect(ExecutionStatus.running.icon, Icons.play_circle_outline);
      expect(ExecutionStatus.completed.icon, Icons.check_circle_outline);
      expect(ExecutionStatus.failed.icon, Icons.error_outline);
    });
  });

  group('StepStatus', () {
    test('fromJson 解析有效状态', () {
      expect(StepStatus.fromJson('pending'), StepStatus.pending);
      expect(StepStatus.fromJson('queued'), StepStatus.queued);
      expect(StepStatus.fromJson('running'), StepStatus.running);
      expect(StepStatus.fromJson('completed'), StepStatus.completed);
      expect(StepStatus.fromJson('failed'), StepStatus.failed);
      expect(StepStatus.fromJson('skipped'), StepStatus.skipped);
      expect(StepStatus.fromJson('cancelled'), StepStatus.cancelled);
    });

    test('fromJson 解析 snake_case waiting_intervention', () {
      expect(
        StepStatus.fromJson('waiting_intervention'),
        StepStatus.waitingIntervention,
      );
    });

    test('fromJson 未知状态回退到 pending', () {
      expect(StepStatus.fromJson('nonexistent'), StepStatus.pending);
    });

    test('toJson 输出正确格式', () {
      expect(StepStatus.running.toJson(), 'running');
      expect(StepStatus.waitingIntervention.toJson(), 'waiting_intervention');
      expect(StepStatus.completed.toJson(), 'completed');
    });

    test('isTerminal 正确判断终态', () {
      expect(StepStatus.pending.isTerminal, isFalse);
      expect(StepStatus.queued.isTerminal, isFalse);
      expect(StepStatus.running.isTerminal, isFalse);
      expect(StepStatus.waitingIntervention.isTerminal, isFalse);
      expect(StepStatus.completed.isTerminal, isTrue);
      expect(StepStatus.failed.isTerminal, isTrue);
      expect(StepStatus.skipped.isTerminal, isTrue);
      expect(StepStatus.cancelled.isTerminal, isTrue);
    });

    test('color 返回正确颜色', () {
      expect(StepStatus.pending.color, Colors.grey.shade300);
      expect(StepStatus.queued.color, Colors.grey.shade500);
      expect(StepStatus.running.color, Colors.blue);
      expect(StepStatus.waitingIntervention.color, Colors.amber);
      expect(StepStatus.completed.color, Colors.green);
      expect(StepStatus.failed.color, Colors.red);
      expect(StepStatus.skipped.color, Colors.grey.shade400);
      expect(StepStatus.cancelled.color, Colors.orange);
    });

    test('label 返回正确显示文本', () {
      expect(StepStatus.waitingIntervention.label, 'Waiting');
      expect(StepStatus.running.label, 'Running');
    });

    test('icon 返回正确图标', () {
      expect(StepStatus.running.icon, Icons.sync);
      expect(StepStatus.waitingIntervention.icon, Icons.front_hand_outlined);
      expect(StepStatus.completed.icon, Icons.check_circle);
    });
  });
}
