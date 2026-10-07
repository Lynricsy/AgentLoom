import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  PluginManifestSchema,
  validateManifest,
  type PluginManifest,
} from '@agentloom/plugin-sdk';
import type { FastifyRequest } from 'fastify';
import type JSZip from 'jszip';
import { parse as parseYaml } from 'yaml';

import { Roles } from '../../common/decorators/roles.decorator';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  extractMultipartFieldValue,
  readSignedAlpArchive,
} from '../plugin/plugin-archive-intake.util';
import { PluginDeveloperKeyService } from '../plugin/plugin-developer-key.service';
import { PluginSignatureService } from '../plugin/plugin-signature.service';
import {
  QueryRuntimePluginsDto,
  QueryRuntimePluginsSchema,
  RegisterRuntimePluginSchema,
  RuntimePluginEnvelopeDto,
  RuntimePluginListResponseDto,
  UpdateRuntimePluginStatusDto,
  UpdateRuntimePluginStatusSchema,
} from './dto/runtime-plugin.dto';
import {
  MAX_RUNTIME_PLUGIN_FILE_SIZE,
  RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION,
} from './runtime-plugin.constants';
import {
  RuntimePluginUnsupportedDshVersionException,
  RuntimePluginValidationException,
} from './runtime-plugin.exceptions';
import {
  RuntimePluginService,
  toRuntimePluginResponse,
} from './runtime-plugin.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Runtime Plugins')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('runtime-plugins')
export class RuntimePluginController {
  constructor(
    private readonly runtimePluginService: RuntimePluginService,
    private readonly signatureService: PluginSignatureService,
    private readonly developerKeyService: PluginDeveloperKeyService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传已签名的 .alp runtime 插件包（dsh 插件）' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'AgentLoom runtime 插件包（.alp，manifest.kind=runtime）',
        },
        status: {
          type: 'string',
          enum: ['registered', 'active'],
          description: '注册后的初始状态，默认 registered',
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: RuntimePluginEnvelopeDto })
  @ApiResponse({ status: 400, description: '缺少插件签名' })
  @ApiResponse({ status: 401, description: '认证失败或签名验证失败' })
  @ApiResponse({ status: 403, description: '权限不足或签名者不是上传者' })
  @ApiResponse({ status: 409, description: '同版本 runtime 插件已存在' })
  @ApiResponse({ status: 413, description: '插件文件过大' })
  @ApiResponse({ status: 422, description: 'runtime 插件包校验失败' })
  async register(@Req() req: AuthenticatedRequest) {
    const tenantId = this.getTenantId(req);
    const orgId =
      req.user.orgId ??
      req.user.org_id ??
      (await this.runtimePluginService.resolveOrganizationId(tenantId));
    const archive = await readSignedAlpArchive(req, {
      orgId,
      userId: req.user.sub,
      maxFileSize: MAX_RUNTIME_PLUGIN_FILE_SIZE,
      signatureService: this.signatureService,
      developerKeyService: this.developerKeyService,
    });
    const options = RegisterRuntimePluginSchema.parse({
      status: extractMultipartFieldValue(archive.fields, 'status'),
    });

    const manifest = this.parseRuntimeManifest(archive.manifest);
    const runtime = manifest.runtime;
    if (!runtime) {
      // validateManifest 已保证 kind=runtime 时 runtime 必填，这里只为类型收窄。
      throw new RuntimePluginValidationException('manifest 缺少 runtime 字段');
    }

    if (runtime.dshVersion !== RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION) {
      throw new RuntimePluginUnsupportedDshVersionException(runtime.dshVersion);
    }

    // zip 条目名不带开头的 `./`，manifest 里的相对路径需先对齐。
    const bundlePatch = await this.requireArchiveFile(
      archive.zip,
      runtime.patch.replace(/^(\.\/)+/, ''),
    ).async('string');
    this.requireArchiveFile(archive.zip, runtime.entry.replace(/^(\.\/)+/, ''));

    this.assertBundlePatch(bundlePatch);

    const created = await this.runtimePluginService.register({
      tenantId,
      orgId,
      userId: req.user.sub,
      manifest,
      rawManifest: archive.manifest,
      archive: archive.buffer,
      bundlePatch,
      signature: archive.signature,
      contentHash: archive.contentHash,
      status: options.status,
    });

    return { data: toRuntimePluginResponse(created) };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询 runtime 插件' })
  @ApiResponse({ status: 200, type: RuntimePluginListResponseDto })
  async findAll(
    @Query(new ZodValidationPipe(QueryRuntimePluginsSchema))
    query: QueryRuntimePluginsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.runtimePluginService.findAll(this.getTenantId(req), query);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取 runtime 插件详情' })
  @ApiResponse({ status: 200, type: RuntimePluginEnvelopeDto })
  @ApiResponse({ status: 404, description: 'runtime 插件不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const record = await this.runtimePluginService.findById(
      id,
      this.getTenantId(req),
    );

    return { data: toRuntimePluginResponse(record) };
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新 runtime 插件状态' })
  @ApiBody({ type: UpdateRuntimePluginStatusDto })
  @ApiResponse({ status: 200, type: RuntimePluginEnvelopeDto })
  @ApiResponse({ status: 404, description: 'runtime 插件不存在' })
  @ApiResponse({ status: 409, description: 'runtime 插件版本冲突' })
  @ApiResponse({ status: 422, description: '状态更新参数无效' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRuntimePluginStatusSchema))
    dto: UpdateRuntimePluginStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const record = await this.runtimePluginService.updateStatus(
      id,
      this.getTenantId(req),
      dto.status,
      dto.occVersion,
    );

    return { data: toRuntimePluginResponse(record) };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 runtime 插件' })
  @ApiResponse({ status: 204, description: 'runtime 插件已删除' })
  @ApiResponse({ status: 404, description: 'runtime 插件不存在' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.runtimePluginService.remove(id, this.getTenantId(req));
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }

  /** 先按 kind 分流（节点插件给出明确指引），再做完整 manifest 校验。 */
  private parseRuntimeManifest(raw: Record<string, unknown>): PluginManifest {
    if (raw.kind !== 'runtime') {
      throw new RuntimePluginValidationException(
        '该包不是 runtime 插件（manifest.kind 必须为 runtime）；节点插件请到 /plugins 上传',
      );
    }

    const validation = validateManifest(raw);

    if (!validation.valid) {
      throw new RuntimePluginValidationException(validation.errors);
    }

    return PluginManifestSchema.parse(raw);
  }

  private requireArchiveFile(zip: JSZip, path: string): JSZip.JSZipObject {
    const file = zip.file(path);

    if (!file) {
      throw new RuntimePluginValidationException(`插件包缺少 ${path}`);
    }

    return file;
  }

  /** bundle patch 必须是 YAML 列表，且每项为 `insert` 或按 `id` 覆盖的条目。 */
  private assertBundlePatch(bundlePatch: string): void {
    let parsed: unknown;

    try {
      parsed = parseYaml(bundlePatch);
    } catch (error) {
      throw new RuntimePluginValidationException(
        `cordis.patch.yml 不是合法 YAML: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new RuntimePluginValidationException(
        'cordis.patch.yml 顶层必须是 YAML 列表',
      );
    }

    parsed.forEach((item: unknown, index) => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        !('insert' in item || 'id' in item)
      ) {
        throw new RuntimePluginValidationException(
          `cordis.patch.yml 第 ${index + 1} 项必须包含 insert 或 id`,
        );
      }
    });
  }
}
