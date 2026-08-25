import type { MultipartFile } from '@fastify/multipart';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import JSZip from 'jszip';

import { Roles } from '../../common/decorators/roles.decorator';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtPayload } from '../../common/guards/auth.guard';
import type { PluginRecord } from '../../database/schema/plugins.schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  QueryPluginsDto,
  QueryPluginsSchema,
  RegisterPluginSchema,
  UpdatePluginStatusDto,
  UpdatePluginStatusSchema,
} from './dto/plugin.dto';
import {
  QueryPluginUsageQueryDto,
  QueryPluginUsageSchema,
  QueryPluginUsageSummaryQueryDto,
  QueryPluginUsageSummarySchema,
} from './dto/plugin-usage-query.dto';
import { MAX_PLUGIN_FILE_SIZE } from './plugin.constants';
import {
  PluginAlreadyExistsException,
  PluginFileTooLargeException,
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
  PluginValidationException,
} from './plugin.exceptions';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import { PluginSignatureService } from './plugin-signature.service';
import { PluginUsageService } from './plugin-usage.service';
import { PluginService } from './plugin.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Plugins')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

  constructor(
    private readonly pluginService: PluginService,
    private readonly storageService: StorageService,
    private readonly signatureService: PluginSignatureService,
    private readonly developerKeyService: PluginDeveloperKeyService,
    private readonly pluginUsageService: PluginUsageService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传 .alp 插件包并注册插件' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'AgentLoom 插件包（.alp）',
        },
        status: {
          type: 'string',
          enum: ['registered', 'active', 'disabled', 'error'],
          description: '注册后要切换到的状态，默认 registered',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '插件注册成功' })
  @ApiResponse({ status: 400, description: '缺少插件签名' })
  @ApiResponse({ status: 401, description: '认证失败或签名验证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 409, description: '插件已存在' })
  @ApiResponse({ status: 413, description: '插件文件过大' })
  @ApiResponse({ status: 422, description: '插件包校验失败' })
  async register(@Req() req: AuthenticatedRequest) {
    const tenantId = this.getTenantId(req);
    const orgId =
      req.user.orgId ??
      req.user.org_id ??
      (await this.pluginService.resolveOrganizationId(tenantId));
    const multipartFile = await this.readMultipartFile(req);
    this.ensureAlpFile(multipartFile);

    const registerOptions = this.parseRegisterOptions(multipartFile);
    const buffer = await this.readMultipartBuffer(multipartFile);
    const { manifest, nodeDefinitions } = await this.parsePluginArchive(buffer);

    const pluginId =
      (manifest.id as string) ?? (manifest.pluginId as string) ?? 'unknown';
    const version = (manifest.version as string) ?? '0.0.0';

    const signingMetadata = this.requireSigningMetadata(manifest, pluginId);

    const developerKey =
      await this.developerKeyService.findActiveKeyByFingerprint(
        orgId,
        signingMetadata.developerKeyFingerprint,
      );

    if (!developerKey) {
      throw new PluginSignatureInvalidException(pluginId);
    }

    const verificationResult =
      await this.signatureService.verifyArchiveSignature(
        buffer,
        signingMetadata.signature,
        developerKey.publicKey,
        pluginId,
      );

    if (verificationResult.contentHash !== signingMetadata.contentHash) {
      throw new PluginSignatureInvalidException(pluginId);
    }

    const signature = signingMetadata.signature;
    const contentHash = verificationResult.contentHash;

    // WASM 为唯一正式运行时：产物校验必须在任何上传之前完成。
    const wasmEntry = this.requireWasmEntry(manifest);
    const wasmBuffer = await this.extractWasmFromArchive(buffer, wasmEntry);

    // 重复注册预检：避免为已存在的插件留下孤儿对象。
    const existing = await this.pluginService.findByPluginId(
      pluginId,
      orgId,
      tenantId,
    );

    if (existing) {
      throw new PluginAlreadyExistsException(pluginId);
    }

    const storageKey = `tenants/${tenantId}/plugins/${pluginId}/${version}/archive.alp`;
    const wasmBundleUrl = `tenants/${tenantId}/plugins/${pluginId}/${version}/plugin.wasm`;

    // 补偿范围只覆盖“上传 + 落库”：一旦插件行已写入，
    // 后续状态切换失败不得删除该行仍在引用的产物。
    const created = await this.uploadAndRegisterPlugin({
      tenantId,
      orgId,
      userId: req.user.sub,
      manifest,
      nodeDefinitions,
      archiveBuffer: buffer,
      wasmBuffer,
      storageKey,
      wasmBundleUrl,
      signature,
      contentHash,
    });

    const data =
      registerOptions.status === 'registered'
        ? created
        : await this.pluginService.updateStatus(
            created.id,
            tenantId,
            registerOptions.status,
            created.occVersion,
          );

    return { data };
  }

  private async uploadAndRegisterPlugin(params: {
    tenantId: string;
    orgId: string;
    userId: string;
    manifest: Record<string, unknown>;
    nodeDefinitions: Array<Record<string, unknown>>;
    archiveBuffer: Buffer;
    wasmBuffer: Buffer;
    storageKey: string;
    wasmBundleUrl: string;
    signature: string;
    contentHash: string;
  }): Promise<PluginRecord> {
    try {
      await this.storageService.upload(
        params.storageKey,
        params.archiveBuffer,
        params.archiveBuffer.length,
        'application/zip',
      );
      await this.storageService.upload(
        params.wasmBundleUrl,
        params.wasmBuffer,
        params.wasmBuffer.length,
        'application/wasm',
      );

      return await this.pluginService.register(
        params.tenantId,
        params.orgId,
        params.userId,
        params.manifest,
        params.nodeDefinitions,
        params.storageKey,
        {
          signature: params.signature,
          contentHash: params.contentHash,
          wasmBundleUrl: params.wasmBundleUrl,
        },
      );
    } catch (error) {
      await this.deleteStorageObjectsBestEffort([
        params.storageKey,
        params.wasmBundleUrl,
      ]);
      throw error;
    }
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询插件列表' })
  @ApiResponse({ status: 200, description: '插件列表' })
  async findAll(
    @Query(new ZodValidationPipe(QueryPluginsSchema)) query: QueryPluginsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginService.findAll(this.getTenantId(req), query);
  }

  private requireSigningMetadata(
    manifest: Record<string, unknown>,
    pluginId: string,
  ): {
    signature: string;
    contentHash: string;
    developerKeyFingerprint: string;
  } {
    const signature = this.getNonEmptyString(manifest.signature);
    const contentHash = this.getNonEmptyString(manifest.contentHash);
    const developerKeyFingerprint = this.getNonEmptyString(
      manifest.developerKeyFingerprint,
    );

    if (!signature || !contentHash || !developerKeyFingerprint) {
      throw new PluginSignatureMissingException(pluginId);
    }

    return {
      signature,
      contentHash,
      developerKeyFingerprint,
    };
  }

  private getNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取插件详情' })
  @ApiResponse({ status: 200, description: '插件详情' })
  @ApiResponse({ status: 404, description: '插件不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.pluginService.findById(id, this.getTenantId(req));
    return { data };
  }

  @Get(':id/usage')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询插件用量流水' })
  @ApiResponse({ status: 200, description: '插件用量流水' })
  @ApiResponse({ status: 404, description: '插件不存在' })
  async findUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(QueryPluginUsageSchema))
    query: QueryPluginUsageQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = this.getTenantId(req);
    // 先按租户校验插件存在，避免跨租户探测用量
    await this.pluginService.findById(id, tenantId);

    return this.pluginUsageService.findUsageByPlugin(id, query);
  }

  @Get(':id/usage/summary')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询插件用量汇总（默认当前 UTC 自然月）' })
  @ApiResponse({ status: 200, description: '插件用量汇总' })
  @ApiResponse({ status: 404, description: '插件不存在' })
  async getUsageSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(QueryPluginUsageSummarySchema))
    query: QueryPluginUsageSummaryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = this.getTenantId(req);
    await this.pluginService.findById(id, tenantId);

    const periodEnd = query.periodEnd ? new Date(query.periodEnd) : new Date();
    const periodStart = query.periodStart
      ? new Date(query.periodStart)
      : new Date(
          Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1),
        );

    const data = await this.pluginUsageService.getUsageSummary(
      id,
      periodStart,
      periodEnd,
    );

    return {
      data: {
        ...data,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    };
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新插件状态' })
  @ApiBody({ type: UpdatePluginStatusDto })
  @ApiResponse({ status: 200, description: '插件状态已更新' })
  @ApiResponse({ status: 404, description: '插件不存在' })
  @ApiResponse({ status: 409, description: '插件版本冲突' })
  @ApiResponse({ status: 422, description: '状态更新参数无效' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePluginStatusSchema))
    dto: UpdatePluginStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.pluginService.updateStatus(
      id,
      this.getTenantId(req),
      dto.status,
      dto.occVersion,
    );

    return { data };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除插件' })
  @ApiResponse({ status: 204, description: '插件已删除' })
  @ApiResponse({ status: 404, description: '插件不存在' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.pluginService.remove(id, this.getTenantId(req));
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }

  private parseRegisterOptions(
    multipartFile: MultipartFile,
  ): RegisterPluginDtoType {
    const status = this.extractMultipartFieldValue(
      multipartFile.fields,
      'status',
    );

    return RegisterPluginSchema.parse({
      ...(status ? { status } : {}),
    });
  }

  private extractMultipartFieldValue(
    fields: unknown,
    fieldName: string,
  ): string | undefined {
    if (!fields || typeof fields !== 'object') {
      return undefined;
    }

    const rawValue = (fields as Record<string, unknown>)[fieldName];

    if (Array.isArray(rawValue)) {
      const first = rawValue[0];
      if (first && typeof first === 'object' && 'value' in first) {
        const value = (first as { value?: unknown }).value;
        return typeof value === 'string' ? value : undefined;
      }
      return undefined;
    }

    if (rawValue && typeof rawValue === 'object' && 'value' in rawValue) {
      const value = (rawValue as { value?: unknown }).value;
      return typeof value === 'string' ? value : undefined;
    }

    return undefined;
  }

  private async readMultipartFile(
    request: AuthenticatedRequest,
  ): Promise<MultipartFile> {
    try {
      const multipartFile = await request.file();

      if (!multipartFile) {
        throw new PluginValidationException('缺少插件文件');
      }

      return multipartFile;
    } catch (error) {
      this.rethrowMultipartLimitError(error);
      throw error;
    }
  }

  private async readMultipartBuffer(
    multipartFile: MultipartFile,
  ): Promise<Buffer> {
    try {
      const buffer = await multipartFile.toBuffer();

      if (
        buffer.length > MAX_PLUGIN_FILE_SIZE ||
        multipartFile.file.truncated
      ) {
        throw new PluginFileTooLargeException();
      }

      return buffer;
    } catch (error) {
      this.rethrowMultipartLimitError(error);
      throw error;
    }
  }

  private rethrowMultipartLimitError(error: unknown): void {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new PluginFileTooLargeException();
    }
  }

  private ensureAlpFile(multipartFile: MultipartFile): void {
    const filename = multipartFile.filename ?? '';

    if (!filename.toLowerCase().endsWith('.alp')) {
      throw new PluginValidationException('插件包必须是 .alp 文件');
    }
  }

  private async parsePluginArchive(buffer: Buffer): Promise<{
    manifest: Record<string, unknown>;
    nodeDefinitions: Array<Record<string, unknown>>;
  }> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const manifestFile = zip.file('manifest.json');

      if (!manifestFile) {
        throw new PluginValidationException('插件包缺少 manifest.json');
      }

      const manifest = this.parseJsonRecord(
        await manifestFile.async('string'),
        'manifest.json',
      );

      const nodeDefinitions = await this.parseNodeDefinitions(zip, manifest);

      return { manifest, nodeDefinitions };
    } catch (error) {
      if (error instanceof PluginValidationException) {
        throw error;
      }

      throw new PluginValidationException('插件包解析失败');
    }
  }

  private async parseNodeDefinitions(
    zip: JSZip,
    manifest: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const nodeDefinitionFile =
      zip.file('node-definitions.json') ?? zip.file('nodeDefinitions.json');

    if (nodeDefinitionFile) {
      const parsed = this.parseJsonValue(
        await nodeDefinitionFile.async('string'),
        nodeDefinitionFile.name,
      );

      return this.normalizeNodeDefinitions(parsed, nodeDefinitionFile.name);
    }

    if (Array.isArray(manifest.nodeDefinitions)) {
      return this.normalizeNodeDefinitions(
        manifest.nodeDefinitions,
        'manifest.json#nodeDefinitions',
      );
    }

    if (Array.isArray(manifest.nodes)) {
      return this.normalizeNodeDefinitions(
        manifest.nodes,
        'manifest.json#nodes',
      );
    }

    return [];
  }

  private normalizeNodeDefinitions(
    value: unknown,
    sourceLabel: string,
  ): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      throw new PluginValidationException(`${sourceLabel} 必须是数组`);
    }

    return value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new PluginValidationException(
          `${sourceLabel}[${index}] 必须是对象`,
        );
      }

      return item as Record<string, unknown>;
    });
  }

  private parseJsonRecord(
    raw: string,
    sourceLabel: string,
  ): Record<string, unknown> {
    const parsed = this.parseJsonValue(raw, sourceLabel);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new PluginValidationException(`${sourceLabel} 必须是 JSON 对象`);
    }

    return parsed as Record<string, unknown>;
  }

  private parseJsonValue(raw: string, sourceLabel: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      throw new PluginValidationException(`${sourceLabel} 不是合法 JSON`);
    }
  }

  /** WASM 模块魔数：`\0asm` */
  private static readonly WASM_MAGIC_BYTES = Buffer.from([
    0x00, 0x61, 0x73, 0x6d,
  ]);

  private requireWasmEntry(manifest: Record<string, unknown>): string {
    const wasmEntry =
      typeof manifest.wasmEntry === 'string' ? manifest.wasmEntry.trim() : '';

    if (!wasmEntry) {
      throw new PluginValidationException(
        '插件缺少 wasmEntry，正式插件必须提供 WASM 产物',
      );
    }

    if (
      wasmEntry.startsWith('/') ||
      wasmEntry.includes('\\') ||
      wasmEntry.split('/').includes('..')
    ) {
      throw new PluginValidationException(
        `wasmEntry 必须是归档内的安全相对路径: ${wasmEntry}`,
      );
    }

    return wasmEntry;
  }

  private async extractWasmFromArchive(
    archiveBuffer: Buffer,
    wasmEntry: string,
  ): Promise<Buffer> {
    const zip = await JSZip.loadAsync(archiveBuffer).catch(() => {
      throw new PluginValidationException(
        `插件包解析失败，无法读取 wasmEntry: ${wasmEntry}`,
      );
    });
    const wasmFile = zip.file(wasmEntry);

    if (!wasmFile) {
      throw new PluginValidationException(
        `插件包中未找到 wasmEntry 指向的文件: ${wasmEntry}`,
      );
    }

    const wasmBuffer = Buffer.from(await wasmFile.async('uint8array'));

    if (
      !wasmBuffer
        .subarray(0, PluginController.WASM_MAGIC_BYTES.length)
        .equals(PluginController.WASM_MAGIC_BYTES)
    ) {
      throw new PluginValidationException(
        `wasmEntry 指向的文件不是合法 WASM 模块: ${wasmEntry}`,
      );
    }

    return wasmBuffer;
  }

  private async deleteStorageObjectsBestEffort(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storageService.delete(key);
      } catch (error) {
        this.logger.warn(
          `注册回滚清理对象失败: ${key} (${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
    }
  }
}
