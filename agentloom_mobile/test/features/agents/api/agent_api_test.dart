import 'package:agentloom_mobile/features/agents/api/agent_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockDio mockDio;
  late AgentApi api;

  setUp(() {
    mockDio = MockDio();
    api = AgentApi(mockDio);
  });

  Response<dynamic> okResponse(
    Map<String, dynamic> data, {
    int statusCode = 200,
  }) {
    return Response(
      data: data,
      statusCode: statusCode,
      requestOptions: RequestOptions(),
    );
  }

  group('AgentApi', () {
    test('listAgents 使用 server canonical pageSize 查询参数', () async {
      when(
        () =>
            mockDio.get(any(), queryParameters: any(named: 'queryParameters')),
      ).thenAnswer(
        (_) async => okResponse({
          'data': <dynamic>[],
          'meta': {'total': 0, 'page': 2, 'pageSize': 10, 'totalPages': 0},
        }),
      );

      await api.listAgents(page: 2, pageSize: 10);

      verify(
        () => mockDio.get(
          '/api/v1/agent-definitions',
          queryParameters: {'page': 2, 'pageSize': 10},
        ),
      ).called(1);
    });

    test('cancelConversation 应发送空 JSON body', () async {
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async =>
            Response<void>(statusCode: 204, requestOptions: RequestOptions()),
      );

      await api.cancelConversation('conv-001');

      verify(
        () => mockDio.post(
          '/api/v1/agent-conversations/conv-001/cancel',
          data: const <String, dynamic>{},
        ),
      ).called(1);
    });

    test('generateConversationTitle 应发送空 JSON body 并解析标题', () async {
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => okResponse({
          'data': {'title': '新标题'},
        }),
      );

      final title = await api.generateConversationTitle('conv-001');

      verify(
        () => mockDio.post(
          '/api/v1/agent-conversations/conv-001/generate-title',
          data: const <String, dynamic>{},
        ),
      ).called(1);
      expect(title, '新标题');
    });

    test(
      'restartConversationToLatestVersion 应发送空 JSON body 并返回会话 id',
      () async {
        when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
          (_) async => okResponse({
            'data': {'conversationId': 'conv-002'},
          }, statusCode: 201),
        );

        final nextConversationId = await api.restartConversationToLatestVersion(
          'conv-001',
        );

        verify(
          () => mockDio.post(
            '/api/v1/agent-conversations/conv-001/restart-latest-version',
            data: const <String, dynamic>{},
          ),
        ).called(1);
        expect(nextConversationId, 'conv-002');
      },
    );
  });
}
