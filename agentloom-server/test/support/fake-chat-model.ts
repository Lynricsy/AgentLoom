/**
 * OpenAI 兼容假模型的传输层：只应答 `POST …/chat/completions`，按调用方的 `decide` 回调给出
 * 文本、工具调用或挂起；同时支持 SSE 流式与非流式 JSON。E2E 用它驱动进程内 pi 运行时。
 */
import { once } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeReply =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown> }
  | { kind: 'hold' };

export interface FakeChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{ function?: { name?: string } }>;
  name?: string;
}

export interface FakeChatRequest {
  model?: string;
  stream?: boolean;
  messages?: FakeChatMessage[];
  tools?: Array<{ function?: { name?: string; description?: string } }>;
}

export const FAKE_USAGE = { prompt_tokens: 120, completion_tokens: 30 };

/** 消息正文：字符串原样返回，多段内容拼接其中的 text */
export function messageText(message: FakeChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: unknown) =>
        part && typeof part === 'object' && 'text' in part
          ? String(part.text)
          : '',
      )
      .join('');
  }
  return '';
}

export class FakeChatModel {
  private server!: http.Server;
  private readonly held = new Set<http.ServerResponse>();
  private sequence = 0;
  baseUrl = '';

  constructor(private readonly decide: (request: FakeChatRequest) => FakeReply) {}

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
          res.writeHead(404).end();
          return;
        }
        const body = JSON.parse(
          Buffer.concat(chunks).toString('utf8'),
        ) as FakeChatRequest;
        this.write(body, res, this.decide(body));
      });
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    for (const res of this.held) {
      res.destroy();
    }
    this.held.clear();
    this.server.close();
    await once(this.server, 'close');
  }

  /** 当前挂起（未回复）的请求数 */
  heldCount(): number {
    return this.held.size;
  }

  private write(
    body: FakeChatRequest,
    res: http.ServerResponse,
    reply: FakeReply,
  ): void {
    if (reply.kind === 'hold') {
      // 挂起不回复：模拟成员正在生成，直到被取消（客户端断开）或测试结束
      this.held.add(res);
      res.on('close', () => this.held.delete(res));
      return;
    }

    this.sequence += 1;
    const id = `chatcmpl-${this.sequence}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? 'fake-team-model';
    const usage = {
      ...FAKE_USAGE,
      total_tokens: FAKE_USAGE.prompt_tokens + FAKE_USAGE.completion_tokens,
    };
    const delta =
      reply.kind === 'text'
        ? { role: 'assistant', content: reply.text }
        : {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                index: 0,
                id: `call_${this.sequence}`,
                type: 'function',
                function: {
                  name: reply.name,
                  arguments: JSON.stringify(reply.args),
                },
              },
            ],
          };
    const finishReason = reply.kind === 'text' ? 'stop' : 'tool_calls';

    if (body.stream === false) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id,
          object: 'chat.completion',
          created,
          model,
          choices: [
            {
              index: 0,
              message: delta,
              finish_reason: finishReason,
            },
          ],
          usage,
        }),
      );
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = (payload: unknown) =>
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    const base = { id, object: 'chat.completion.chunk', created, model };
    send({ ...base, choices: [{ index: 0, delta, finish_reason: null }] });
    send({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    });
    send({ ...base, choices: [], usage });
    res.end('data: [DONE]\n\n');
  }
}
