import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/theme.dart';
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

    return MaterialApp.router(
      title: env.appName,
      theme: AppTheme.light(),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
