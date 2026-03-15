import { Injectable, Logger } from '@nestjs/common';

import {
  LlmProviderException,
  LlmTimeoutException,
} from './llm.exceptions';
import type { TestConnectionDto } from './dto/test-connection.dto';
import type { FetchPrivateCloudModelsDto } from './dto/private-cloud-models.dto';

export interface PrivateCloudModelInfo {
  id: string;
  name: string;
  ownedBy: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  serverInfo?: string;
}

@Injectable()
export class PrivateCloudService {
  private readonly logger = new Logger(PrivateCloudService.name);

  async testConnection(dto: TestConnectionDto): Promise<TestConnectionResult> {
    const { endpointUrl, authMethod, authConfig, timeoutMs } = dto;
    const timeout = timeoutMs ?? 10000;
    const headers = this.buildHeaders(authMethod, authConfig);
    const baseUrl = this.normalizeBaseUrl(endpointUrl);

    const start = Date.now();

    try {
      const healthRes = await this.fetchWithTimeout(
        `${baseUrl}/health`,
        { headers },
        timeout,
      );

      if (healthRes.ok) {
        return {
          success: true,
          latencyMs: Date.now() - start,
          serverInfo: await this.extractServerInfo(healthRes),
        };
      }
    } catch {
      this.logger.debug(`/health 端点不可用，尝试 /v1/models`);
    }

    try {
      const modelsRes = await this.fetchWithTimeout(
        `${baseUrl}/v1/models`,
        { headers },
        timeout,
      );

      this.checkAuthError(modelsRes, 'private_cloud');

      if (modelsRes.ok) {
        return {
          success: true,
          latencyMs: Date.now() - start,
        };
      }

      throw new LlmProviderException(
        'private_cloud',
        `端点返回状态码 ${modelsRes.status}`,
      );
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }

      throw new LlmProviderException(
        'private_cloud',
        `无法连接到私有云端点: ${(error as Error).message}`,
      );
    }
  }

  async fetchModels(
    dto: FetchPrivateCloudModelsDto,
  ): Promise<PrivateCloudModelInfo[]> {
    const { endpointUrl, authMethod, authConfig } = dto;
    const headers = this.buildHeaders(authMethod, authConfig);
    const baseUrl = this.normalizeBaseUrl(endpointUrl);

    try {
      const res = await this.fetchWithTimeout(
        `${baseUrl}/v1/models`,
        { headers },
        10000,
      );

      this.checkAuthError(res, 'private_cloud');

      if (!res.ok) {
        throw new LlmProviderException(
          'private_cloud',
          `获取模型列表失败，状态码 ${res.status}`,
        );
      }

      const body = (await res.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
      };

      if (!body.data || !Array.isArray(body.data)) {
        return [];
      }

      return body.data.map((m) => ({
        id: m.id,
        name: m.id,
        ownedBy: m.owned_by ?? 'unknown',
      }));
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }

      throw new LlmProviderException(
        'private_cloud',
        `无法获取模型列表: ${(error as Error).message}`,
      );
    }
  }

  private buildHeaders(
    authMethod: string,
    authConfig?: Record<string, unknown>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authMethod === 'api_key' && authConfig?.apiKey) {
      headers['Authorization'] = `Bearer ${String(authConfig.apiKey)}`;
    }

    return headers;
  }

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new LlmTimeoutException(
          'private_cloud',
          `连接超时 (${timeoutMs}ms)`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private checkAuthError(res: Response, provider: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new LlmProviderException(
        provider,
        `认证失败 (${res.status})，请检查认证配置`,
      );
    }
  }

  private async extractServerInfo(res: Response): Promise<string | undefined> {
    try {
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.version === 'string') {
        return body.version;
      }
      if (typeof body.status === 'string') {
        return body.status;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
