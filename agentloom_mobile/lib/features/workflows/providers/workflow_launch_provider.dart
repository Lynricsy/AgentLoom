import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/workflow_api.dart';
import '../models/workflow_input_schema.dart';

/// 工作流启动状态
sealed class WorkflowLaunchState {
  const WorkflowLaunchState();
}

class WorkflowLaunchLoading extends WorkflowLaunchState {
  const WorkflowLaunchLoading();
}

class WorkflowLaunchSchemaLoaded extends WorkflowLaunchState {
  final WorkflowInputSchema schema;
  const WorkflowLaunchSchemaLoaded(this.schema);
}

class WorkflowLaunchSubmitting extends WorkflowLaunchState {
  final WorkflowInputSchema schema;
  const WorkflowLaunchSubmitting(this.schema);
}

class WorkflowLaunchSuccess extends WorkflowLaunchState {
  final String executionId;
  const WorkflowLaunchSuccess(this.executionId);
}

class WorkflowLaunchError extends WorkflowLaunchState {
  final String message;
  final WorkflowInputSchema? schema;
  const WorkflowLaunchError(this.message, {this.schema});
}

/// 工作流启动 Notifier — 管理 schema 加载与执行提交流程
///
/// Riverpod 3.x 模式：构造函数接收 workflowId 参数
class WorkflowLaunchNotifier extends AsyncNotifier<WorkflowLaunchState> {
  WorkflowLaunchNotifier(this.workflowId);
  final String workflowId;

  @override
  Future<WorkflowLaunchState> build() async {
    final api = ref.read(workflowApiProvider);
    final schema = await api.getInputSchema(workflowId);
    return WorkflowLaunchSchemaLoaded(schema);
  }

  /// 提交参数并启动工作流执行
  Future<String?> submit(Map<String, dynamic> formValues) async {
    final currentState = state.value;
    if (currentState == null) return null;

    WorkflowInputSchema? schema;
    if (currentState is WorkflowLaunchSchemaLoaded) {
      schema = currentState.schema;
    } else if (currentState is WorkflowLaunchError) {
      schema = currentState.schema;
    } else {
      return null;
    }

    state = AsyncValue.data(WorkflowLaunchSubmitting(schema!));

    try {
      final api = ref.read(workflowApiProvider);
      final response = await api.runWorkflow(
        workflowId,
        inputParams: formValues.isNotEmpty ? formValues : null,
        launchSource: 'mobile',
      );

      final executionId = _extractExecutionId(response);
      if (executionId == null || executionId.isEmpty) {
        throw StateError('Missing execution id in run response');
      }

      state = AsyncValue.data(WorkflowLaunchSuccess(executionId));
      return executionId;
    } on DioException catch (e) {
      final errorMsg = _extractErrorMessage(e);
      state = AsyncValue.data(WorkflowLaunchError(errorMsg, schema: schema));
      return null;
    } catch (e) {
      state = AsyncValue.data(WorkflowLaunchError('启动失败: $e', schema: schema));
      return null;
    }
  }

  String? _extractExecutionId(Map<String, dynamic> response) {
    final payload = response['data'];
    if (payload is Map<String, dynamic>) {
      final id = payload['id'];
      if (id is String && id.isNotEmpty) return id;
    }
    final id = response['id'];
    if (id is String && id.isNotEmpty) return id;
    return null;
  }

  String _extractErrorMessage(DioException e) {
    final statusCode = e.response?.statusCode;
    if (statusCode == 409) {
      return '此工作流尚未发布，无法启动';
    }
    if (statusCode == 401) {
      return '认证已过期，请重新登录';
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return '网络连接超时，请稍后重试';
    }
    return '启动失败: ${e.message ?? '未知错误'}';
  }
}

/// 工作流启动 Provider（AutoDispose + Family）
///
/// Riverpod 3.x 模式：构造函数注入 workflowId
final workflowLaunchProvider = AsyncNotifierProvider.autoDispose
    .family<WorkflowLaunchNotifier, WorkflowLaunchState, String>(
      WorkflowLaunchNotifier.new,
    );
