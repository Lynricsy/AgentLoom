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
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  QueryPluginsDto,
  QueryPluginsSchema,
  RegisterPluginSchema,
  UpdatePluginStatusDto,
  UpdatePluginStatusSchema,
  type RegisterPluginDtoType,
} from './dto/plugin.dto';
import { MAX_PLUGIN_FILE_SIZE } from './plugin.constants';
import {
  PluginFileTooLargeException,
  PluginSignatureMissingException,
  PluginValidationException,
} from './plugin.exceptions';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';
import { PluginSignatureService } from './plugin-signature.service';
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
    const orgId = req.user.orgId ?? req.user.org_id;
    const multipartFile = await this.readMultipartFile(req);
    this.ensureAlpFile(multipartFile);

    const registerOptions = this.parseRegisterOptions(multipartFile);
    const buffer = await this.readMultipartBuffer(multipartFile);
    const { manifest, nodeDefinitions } = await this.parsePluginArchive(buffer);

    const pluginId = (manifest.id as string) ?? (manifest.pluginId as string) ?? 'unknown';
    const version = (manifest.version as string) ?? '0.0.0';

    let signature: string | undefined;
    let contentHash: string | undefined;

    if (manifest.signature || manifest.contentHash || manifest.developerKeyFingerprint) {
      const manifestSignature = manifest.signature as string | undefined;
      const fingerprint = manifest.developerKeyFingerprint as string | undefined;

      if (!manifestSignature) {
        throw new PluginSignatureMissingException(pluginId);
      }

      if (fingerprint && orgId) {
        const devKey = await this.developerKeyService.findActiveKeyByFingerprint(
          orgId,
          fingerprint,
        );

        if (devKey) {
          const result = this.signatureService.verifyArchiveSignature(
            buffer,
            manifestSignature,
            devKey.publicKey,
            pluginId,
          );
          signature = manifestSignature;
          contentHash = result.contentHash;
        } else {
          this.logger.warn(
            `插件 "${pluginId}" 提供的密钥指纹 "${fingerprint}" 未找到对应的活跃开发者密钥，跳过签名验证`,
          );
          contentHash = this.signatureService.computeContentHash(buffer);
        }
      } else {
        contentHash = this.signatureService.computeContentHash(buffer);
        signature = manifestSignature;
      }
    }

    const storageKey = `tenants/${tenantId}/plugins/${pluginId}/${version}/archive.alp`;
    await this.storageService.upload(storageKey, buffer, buffer.length, 'application/zip');

    let wasmBundleUrl: string | undefined;
    const wasmEntry = manifest.wasmEntry as string | undefined;
    if (wasmEntry) {
      const wasmBuffer = await this.extractWasmFromArchive(buffer, wasmEntry);
      if (wasmBuffer) {
        wasmBundleUrl = `tenants/${tenantId}/plugins/${pluginId}/${version}/plugin.wasm`;
        await this.storageService.upload(
          wasmBundleUrl,
          wasmBuffer,
          wasmBuffer.length,
          'application/wasm',
        );
      }
    }

    const created = await this.pluginService.register(
      tenantId,
      orgId,
      req.user.sub,
      manifest,
      nodeDefinitions,
      storageKey,
      { signature, contentHash, wasmBundleUrl },
    );

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
    const status = this.extractMultipartFieldValue(multipartFile.fields, 'status');

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

  private async readMultipartBuffer(multipartFile: MultipartFile): Promise<Buffer> {
    try {
      const buffer = await multipartFile.toBuffer();

      if (buffer.length > MAX_PLUGIN_FILE_SIZE || multipartFile.file.truncated) {
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
      return this.normalizeNodeDefinitions(manifest.nodes, 'manifest.json#nodes');
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

  private async extractWasmFromArchive(
    archiveBuffer: Buffer,
    wasmEntry: string,
  ): Promise<Buffer | null> {
    try {
      const zip = await JSZip.loadAsync(archiveBuffer);
      const wasmFile = zip.file(wasmEntry);

      if (!wasmFile) {
        this.logger.warn(`插件包中未找到 WASM 入口文件: ${wasmEntry}`);
        return null;
      }

      return Buffer.from(await wasmFile.async('uint8array'));
    } catch (error) {
      this.logger.warn(`提取 WASM 文件失败: ${wasmEntry}`, error);
      return null;
    }
  }
}
