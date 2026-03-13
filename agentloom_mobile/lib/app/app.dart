import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/theme.dart';
import '../features/auth/models/auth_state.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/notifications/providers/push_notification_provider.dart';
import '../routes/app_router.dart';
import '../routes/route_names.dart';
import '../shared/providers/env_provider.dart';

/// AgentLoom 应用根 Widget
class AgentLoomApp extends ConsumerStatefulWidget {
  const AgentLoomApp({super.key});

  @override
  ConsumerState<AgentLoomApp> createState() => _AgentLoomAppState();
}

class _AgentLoomAppState extends ConsumerState<AgentLoomApp> {
  StreamSubscription<dynamic>? _notificationTapSubscription;
  bool _pushInitialized = false;

  @override
  void initState() {
    super.initState();

    final router = ref.read(goRouterProvider);
    final notificationService = ref.read(notificationServiceProvider);
    _notificationTapSubscription = notificationService.onNotificationTap.listen(
      (payload) {
        final executionId = payload.executionId;
        if (executionId == null || executionId.isEmpty) {
          return;
        }

        router.goNamed(
          RouteNames.executionMonitor,
          pathParameters: {'executionId': executionId},
        );
      },
    );
  }

  @override
  void dispose() {
    _notificationTapSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);
    final env = ref.watch(envProvider);

    // 监听认证状态变化：会话恢复（冷启动 build() 读 TokenStorage）
    // 或 login() 成功后，如果 push 尚未初始化则触发推送初始化。
    ref.listen(authProvider, (previous, next) {
      final isAuthenticated = next.value is AuthStateAuthenticated;
      final wasAuthenticated = previous?.value is AuthStateAuthenticated;

      if (isAuthenticated && !wasAuthenticated && !_pushInitialized) {
        _pushInitialized = true;
        unawaited(
          ref.read(pushNotificationProvider.notifier).initializeAfterAuth(),
        );
      }

      // 登出时重置标记，以便重新登录后能再次初始化
      if (!isAuthenticated && wasAuthenticated) {
        _pushInitialized = false;
      }
    });

    return MaterialApp.router(
      title: env.appName,
      theme: AppTheme.light(),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
