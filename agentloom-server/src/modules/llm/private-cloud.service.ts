import { Injectable, Logger } from '@nestjs/common';

import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { LlmProviderException, LlmTimeoutException } from './llm.exceptions';
import type { TestConnectionDto } from './dto/test-connection.dto';
import type { FetchPrivateCloudModelsDto } from './dto/private-cloud-models.dto';

export interface PrivateCloudModelInfo {
  id: string;
  name: string;
  ownedBy: string;
}

export interface PrivateCloudServerInfo {
  version?: string;
  status?: string;
  models?: string[];
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  serverInfo?: PrivateCloudServerInfo;
}

export interface PrivateCloudRequestContext {
  tenantId: string;
  orgId: string;
}

@Injectable()
export class PrivateCloudService {
  private readonly logger = new Logger(PrivateCloudService.name);

  constructor(
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
  ) {}

  async testConnection(
    dto: TestConnectionDto,
    context: PrivateCloudRequestContext,
  ): Promise<TestConnectionResult> {
    const { endpointUrl, authMethod, apiKeyId, timeoutMs } = dto;
    const timeout = timeoutMs ?? 10000;
    const headers = await this.buildHeaders(authMethod, apiKeyId, context);
    const baseUrl = this.normalizeBaseUrl(endpointUrl);

    const start = Date.now();

    try {
      const healthRes = await this.fetchWithTimeout(
        `${baseUrl}/health`,
        { headers },
        timeout,
      );

      this.checkAuthError(healthRes, 'private_cloud');

      if (healthRes.ok) {
        const serverInfo = await this.extractServerInfo(healthRes);
        return {
          success: true,
          latencyMs: Date.now() - start,
          ...(serverInfo ? { serverInfo } : {}),
        };
      }

      this.logger.debug(
        `/health 返回状态 ${healthRes.status}，尝试 /v1/models`,
      );
    } catch (error) {
      if (
        error instanceof LlmProviderException ||
        error instanceof LlmTimeoutException
      ) {
        throw error;
      }

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
        const serverInfo = await this.extractServerInfo(modelsRes);
        return {
          success: true,
          latencyMs: Date.now() - start,
          ...(serverInfo ? { serverInfo } : {}),
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
    context: PrivateCloudRequestContext,
  ): Promise<PrivateCloudModelInfo[]> {
    const { endpointUrl, authMethod, apiKeyId } = dto;
    const headers = await this.buildHeaders(authMethod, apiKeyId, context);
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

  private async buildHeaders(
    authMethod: string,
    apiKeyId: string | undefined,
    context: PrivateCloudRequestContext,
  ): Promise<Record<string, string>> {
    if (authMethod !== 'api_key') {
      return {};
    }

    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: apiKeyId ?? null,
        organizationId: context.orgId,
        tenantId: context.tenantId,
        provider: 'private_cloud',
      },
      PrivateCloudService.name,
    );

    return {
      Authorization: `Bearer ${apiKey}`,
    };
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
        { authenticationFailed: true },
      );
    }
  }

  private async extractServerInfo(
    res: Response,
  ): Promise<PrivateCloudServerInfo | undefined> {
    try {
      const body = (await res.json()) as {
        version?: unknown;
        status?: unknown;
        data?: Array<{ id?: unknown }>;
      };

      const serverInfo: PrivateCloudServerInfo = {};

      if (typeof body.version === 'string') {
        serverInfo.version = body.version;
      }

      if (typeof body.status === 'string') {
        serverInfo.status = body.status;
      }

      if (Array.isArray(body.data)) {
        const models = body.data
          .flatMap((item) => (typeof item.id === 'string' ? [item.id] : []))
          .slice(0, 10);

        if (models.length > 0) {
          serverInfo.models = models;
        }
      }

      return Object.keys(serverInfo).length > 0 ? serverInfo : undefined;
    } catch {
      return undefined;
    }
  }
}
