import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/theme.dart';
import '../routes/app_router.dart';
import '../shared/providers/env_provider.dart';

/// AgentLoom 应用根 Widget
class AgentLoomApp extends ConsumerWidget {
  const AgentLoomApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
