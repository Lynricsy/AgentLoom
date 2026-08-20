import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:agentloom_mobile/features/resources/screens/sandboxes_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockResourcesApi mockResourcesApi;

  final stoppedSandbox = SandboxSessionDto.fromJson(const {
    'id': 'sandbox-stopped-1',
    'tenantId': 'tenant-1',
    'status': 'stopped',
    'bindingType': 'resource',
    'createdAt': '2026-04-08T00:00:00.000Z',
    'workspacePath': '/workspace',
    'config': {
      'cpu': 1,
      'memory': 512,
      'disk': 2,
      'timeout': 24,
      'lifecycleMode': 'persistent',
      'name': 'Stopped Sandbox',
    },
  });

  final readySandbox = SandboxSessionDto.fromJson(const {
    'id': 'sandbox-ready-1',
    'tenantId': 'tenant-1',
    'status': 'ready',
    'bindingType': 'resource',
    'createdAt': '2026-04-08T00:00:00.000Z',
    'workspacePath': '/workspace',
    'config': {
      'cpu': 1,
      'memory': 512,
      'disk': 2,
      'timeout': 24,
      'lifecycleMode': 'persistent',
      'name': 'Ready Sandbox',
    },
  });

  final sampleLog = SandboxLogDto.fromJson(const {
    'id': 'log-1',
    'sessionId': 'sandbox-stopped-1',
    'level': 'info',
    'message': 'sandbox stopped cleanly',
    'createdAt': '2026-04-08T00:01:00.000Z',
  });

  final sampleStats = SandboxStatsDto.fromJson(const {
    'cpuPercent': 12.5,
    'memoryUsageMb': 256,
    'memoryLimitMb': 512,
    'diskUsage': 1024,
    'diskTotal': 4096,
  });

  setUp(() {
    mockResourcesApi = MockResourcesApi();
  });

  Widget createTestWidget(SandboxSessionDto sandbox) {
    when(
      () => mockResourcesApi.listSandboxes(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        search: any(named: 'search'),
        status: any(named: 'status'),
        lifecycleMode: any(named: 'lifecycleMode'),
        bindingType: any(named: 'bindingType'),
      ),
    ).thenAnswer(
      (_) async => PaginatedResponse<SandboxSessionDto>(
        data: [sandbox],
        meta: const PaginationMeta(
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        ),
      ),
    );

    return ProviderScope(
      overrides: [resourcesApiProvider.overrideWithValue(mockResourcesApi)],
      child: const MaterialApp(home: SandboxesScreen()),
    );
  }

  group('SandboxesScreen', () {
    testWidgets('stopped 详情不请求实时 stats，只展示提示与日志', (tester) async {
      when(
        () => mockResourcesApi.getSandboxLogs(stoppedSandbox.id),
      ).thenAnswer((_) async => [sampleLog]);

      await tester.pumpWidget(createTestWidget(stoppedSandbox));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Show menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('查看详情'));
      await tester.pumpAndSettle();

      expect(find.text('实时资源统计仅在运行中的沙箱可用。'), findsOneWidget);
      expect(find.textContaining('sandbox stopped cleanly'), findsOneWidget);
      verifyNever(() => mockResourcesApi.getSandboxStats(stoppedSandbox.id));
      verify(
        () => mockResourcesApi.getSandboxLogs(stoppedSandbox.id),
      ).called(1);
    });

    testWidgets('ready 详情继续加载实时 stats', (tester) async {
      when(
        () => mockResourcesApi.getSandboxStats(readySandbox.id),
      ).thenAnswer((_) async => sampleStats);
      when(
        () => mockResourcesApi.getSandboxLogs(readySandbox.id),
      ).thenAnswer((_) async => const []);

      await tester.pumpWidget(createTestWidget(readySandbox));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Show menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('查看详情'));
      await tester.pumpAndSettle();

      expect(find.text('CPU 12.5%'), findsOneWidget);
      expect(find.text('内存 256 / 512 MB'), findsOneWidget);
      expect(find.text('实时资源统计仅在运行中的沙箱可用。'), findsNothing);
      verify(() => mockResourcesApi.getSandboxStats(readySandbox.id)).called(1);
      verify(() => mockResourcesApi.getSandboxLogs(readySandbox.id)).called(1);
    });
  });
}
