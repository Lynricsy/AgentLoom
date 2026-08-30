import {
  BadRequestException,
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
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Roles } from '../../common/decorators/roles.decorator';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtPayload } from '../../common/guards/auth.guard';
import {
  CreateSkillSchema,
  type CreateSkillDtoType,
} from './dto/create-skill.dto';
import {
  UpdateSkillSchema,
  type UpdateSkillDtoType,
} from './dto/update-skill.dto';
import {
  SkillQuerySchema,
  type SkillQueryDtoType,
} from './dto/skill-query.dto';
import { validateAndCanonicalizeSkillFileName } from './skill-file-name.utils';
import { SkillService } from './skill.service';
import { SkillStorageService } from './skill-storage.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Skills')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('skills')
export class SkillController {
  private readonly logger = new Logger(SkillController.name);

  constructor(
    private readonly skillService: SkillService,
    private readonly skillStorageService: SkillStorageService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '创建 Skill（支持 multipart 上传文件）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        metadata: {
          type: 'string',
          description: 'Skill 元数据 JSON（name/description/content）',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Skill 关联文件',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Skill 创建成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async create(@Req() req: AuthenticatedRequest) {
    const tenantId = this.requireTenantId(req);
    const userId = req.user.sub;

    const { metadata, files } = await this.parseMultipart(req);
    const dto = new ZodValidationPipe(CreateSkillSchema).transform(metadata, {
      type: 'body',
      metatype: undefined,
      data: undefined,
    }) as CreateSkillDtoType;

    return this.skillService.create(tenantId, userId, dto, files);
  }

  @Get()
  @ApiOperation({ summary: '分页查询 Skill 列表' })
  @ApiResponse({ status: 200, description: 'Skill 列表' })
  @ApiResponse({ status: 401, description: '认证失败' })
  async findAll(
    @Query(new ZodValidationPipe(SkillQuerySchema)) query: SkillQueryDtoType,
  ) {
    return this.skillService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取 Skill 详情' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill 详情' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);
    return this.skillService.findById(tenantId, id);
  }

  @Put(':id')
  @Roles('owner', 'admin', 'creator')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '更新 Skill（支持 multipart 上传文件）' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        metadata: {
          type: 'string',
          description:
            'Skill 更新元数据 JSON（name/description/content/occVersion）',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '替换上传的文件',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Skill 更新成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  @ApiResponse({ status: 409, description: '乐观并发冲突' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);
    const userId = req.user.sub;

    const { metadata, files } = await this.parseMultipart(req);
    const dto = new ZodValidationPipe(UpdateSkillSchema).transform(metadata, {
      type: 'body',
      metatype: undefined,
      data: undefined,
    }) as UpdateSkillDtoType;

    return this.skillService.update(tenantId, userId, id, dto, files);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 Skill' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 204, description: 'Skill 已删除' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);
    await this.skillService.delete(tenantId, id);
  }

  @Patch(':id/archive')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '归档 Skill' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: 'Skill 已归档' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  async archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);
    const userId = req.user.sub;
    return this.skillService.archive(tenantId, userId, id);
  }

  @Get(':id/files')
  @ApiOperation({ summary: '列出 Skill 关联文件' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiResponse({ status: 200, description: '文件列表' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  async listFiles(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);
    return this.skillStorageService.listSkillFiles(tenantId, id);
  }

  @Get(':id/files/:fileName')
  @ApiOperation({ summary: '下载 Skill 单个文件' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiParam({ name: 'fileName', description: '文件名' })
  @ApiResponse({ status: 200, description: '文件流' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 404, description: 'Skill 或文件不存在' })
  async downloadFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: false }) reply: any,
  ) {
    const tenantId = this.requireTenantId(req);
    const stream = await this.skillStorageService.downloadSkillFile(
      tenantId,
      id,
      fileName,
    );
    reply.header(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    reply.type('application/octet-stream');
    return reply.send(stream);
  }

  @Post(':id/files')
  @Roles('owner', 'admin', 'creator')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传 Skill 附加文件' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '待上传的文件',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '文件上传成功' })
  @ApiResponse({ status: 400, description: '缺少文件' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Skill 不存在' })
  @HttpCode(HttpStatus.CREATED)
  async uploadFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = this.requireTenantId(req);

    const { files } = await this.parseMultipart(req);
    if (!files.length) {
      throw new BadRequestException('缺少上传文件');
    }
    const file = files[0];

    await this.skillStorageService.uploadSkillFile(
      tenantId,
      id,
      file.filename,
      file.buffer,
      file.mimetype,
    );

    await this.refreshFileMeta(tenantId, id);

    return { message: '文件上传成功', fileName: file.filename };
  }

  @Delete(':id/files/:fileName')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 Skill 单个文件' })
  @ApiParam({ name: 'id', description: 'Skill UUID' })
  @ApiParam({ name: 'fileName', description: '文件名' })
  @ApiResponse({ status: 204, description: '文件已删除' })
  @ApiResponse({ status: 401, description: '认证失败' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Skill 或文件不存在' })
  async deleteFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileName') fileName: string,
  ) {
    const tenantId = this.requireTenantId(req);

    // 单文件删除必须经过 Skill 存储边界，避免 controller 自行拼键绕过统一文件名校验。
    await this.skillStorageService.deleteSkillFile(tenantId, id, fileName);

    await this.refreshFileMeta(tenantId, id);
  }

  private requireTenantId(req: AuthenticatedRequest): string {
    if (!req.tenantId) {
      throw new TenantRequiredException();
    }
    return req.tenantId;
  }

  private async parseMultipart(req: AuthenticatedRequest): Promise<{
    metadata: Record<string, unknown>;
    files: Array<{
      fieldname: string;
      filename: string;
      buffer: Buffer;
      mimetype: string;
    }>;
  }> {
    // 必须保留 multipart 原始路径，否则 busboy 会先取 basename，穿越校验将失去依据。
    const parts = req.parts({ preservePath: true });
    let metadataRaw: string | undefined;
    const files: Array<{
      fieldname: string;
      filename: string;
      buffer: Buffer;
      mimetype: string;
    }> = [];

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'metadata') {
        metadataRaw = part.value as string;
      } else if (part.type === 'file') {
        // 必须先校验原始文件名再取 basename，避免危险路径被静默收口后进入存储层。
        const fileName = validateAndCanonicalizeSkillFileName(part.filename);
        const buffer = await part.toBuffer();
        files.push({
          fieldname: part.fieldname,
          filename: fileName,
          buffer,
          mimetype: part.mimetype,
        });
      }
    }

    let metadata: Record<string, unknown> = {};
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        this.logger.warn('multipart metadata JSON 解析失败，使用空对象');
      }
    }

    return { metadata, files };
  }

  private async refreshFileMeta(
    tenantId: string,
    skillId: string,
  ): Promise<void> {
    await this.skillService.refreshFileMeta(tenantId, skillId);
  }
}
