import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ConvertResourceSourceParamsSchema,
  resourceSourceResourceTypeValues,
  type ConvertResourceSourceParamsDto,
} from './dto/convert-resource-source.dto';
import { ResourceSourceService } from './resource-source.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Resource Sources')
@Controller('resource-sources')
export class ResourceSourceController {
  constructor(private readonly resourceSourceService: ResourceSourceService) {}

  @Post(':resourceType/:resourceId/convert-to-manual')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '将分享导入资源归类为自己创建' })
  @ApiResponse({ status: 200, description: '资源分类更新成功' })
  @ApiParam({
    name: 'resourceType',
    enum: resourceSourceResourceTypeValues,
    description: '资源类型',
  })
  @ApiParam({ name: 'resourceId', format: 'uuid', description: '资源 ID' })
  async convertToManual(
    @Param(new ZodValidationPipe(ConvertResourceSourceParamsSchema))
    params: ConvertResourceSourceParamsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.resourceSourceService.convertToManual(
      this.getTenantId(req),
      params.resourceType,
      params.resourceId,
    );

    return { data };
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }
}
