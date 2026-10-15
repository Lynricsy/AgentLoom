/**
 * TypeSafe Jev（`POST /v1/systemone`）HTTP 接入层。钉版模型由 `APP_TYPESAFE_MODEL` 决定。
 */
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/** 限流（429）与过载（529）各重试一次 */
const RETRYABLE_STATUSES: Record<number, true> = { 429: true, 529: true };
const RETRY_DELAY_MS = 500;
const ERROR_BODY_SNIPPET_MAX = 500;

export const JevAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: z.number() }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    legend: z.unknown().optional(),
    probabilities: z.unknown().optional(),
    confidence: z.number().optional(),
  }),
]);

export const JevResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), JevAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export type JevAnswer = z.infer<typeof JevAnswerSchema>;
export type JevResponse = z.infer<typeof JevResponseSchema>;

export interface JevQuestion {
  type: 'noul' | 'choice' | 'score';
  instructions: string;
  criteria?: Record<string, string>;
}

export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
}

export class JevHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(`Jev HTTP ${status}: ${bodySnippet}`);
    this.name = 'JevHttpError';
  }
}

@Injectable()
export class JevClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  readonly model: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('APP_TYPESAFE_API_KEY');
    this.baseUrl = (
      configService.get<string>('APP_TYPESAFE_BASE_URL') ??
      'https://api.typesafe.ai'
    ).replace(/\/+$/, '');
    this.model =
      configService.get<string>('APP_TYPESAFE_MODEL') ?? 'jev-1.13.0';
  }

  /** 未配置 API Key 时影子模式关闭，调用方不得发起请求 */
  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async evaluate(
    request: JevRequest,
    signal: AbortSignal,
  ): Promise<JevResponse> {
    if (!this.apiKey) {
      throw new Error('APP_TYPESAFE_API_KEY 未配置，Jev 不可用');
    }

    let response = await this.post(request, signal);

    if (RETRYABLE_STATUSES[response.status]) {
      await delay(RETRY_DELAY_MS, undefined, { signal });
      response = await this.post(request, signal);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new JevHttpError(
        response.status,
        body.slice(0, ERROR_BODY_SNIPPET_MAX),
      );
    }

    return JevResponseSchema.parse(await response.json());
  }

  private post(request: JevRequest, signal: AbortSignal): Promise<Response> {
    return fetch(`${this.baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: request.state,
        model: this.model,
        questions: request.questions,
      }),
      signal,
    });
  }
}
