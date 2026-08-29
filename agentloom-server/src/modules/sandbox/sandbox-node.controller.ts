import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { SandboxRuntimeNode } from '../../database/schema';
import {
  CreateSandboxNodeDto,
  DeleteSandboxNodeQueryDto,
  SandboxNodeEnvelopeSwaggerDto,
  SandboxNodeListResponseSwaggerDto,
  UpdateSandboxNodeDto,
  type SandboxNodeEnvelopeDto,
  type SandboxNodeListResponseDto,
  type SandboxNodeResponseDto,
} from './dto';
import { SandboxRuntimeNodeRegistryService } from './sandbox-runtime-node-registry.service';

/**
 * 分布式沙箱运行时节点管理。
 *
 * 节点是跨租户共享的物理基础设施，不是租户数据：除 `@Roles` 之外还有
 * `assertNodeAdmin` 这道门，防止任意租户 admin 操纵全局调度池。
 */
@ApiTags('Sandbox Runtime Nodes')
@Controller('sandbox-nodes')
export class SandboxNodeController {
  constructor(private readonly registry: SandboxRuntimeNodeRegistryService) {}

  @Get()
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'List sandbox runtime nodes with live capacity' })
  @ApiResponse({ status: 200, type: SandboxNodeListResponseSwaggerDto })
  async listNodes(
    @CurrentTenant() tenantId: string,
  ): Promise<SandboxNodeListResponseDto> {
    this.registry.assertNodeAdmin(tenantId);
    const statuses = await this.registry.listNodeStatuses();
    return {
      data: statuses.map(({ node, healthy, capacity }) => ({
        ...serializeNode(node),
        healthy,
        capacity: capacity ?? null,
      })),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Register a sandbox runtime node' })
  @ApiResponse({ status: 201, type: SandboxNodeEnvelopeSwaggerDto })
  async createNode(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSandboxNodeDto,
  ): Promise<SandboxNodeEnvelopeDto> {
    this.registry.assertNodeAdmin(tenantId);
    const node = await this.registry.createNode(dto);
    return { data: serializeNode(node) };
  }

  @Patch(':nodeId')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Update a sandbox runtime node' })
  @ApiResponse({ status: 200, type: SandboxNodeEnvelopeSwaggerDto })
  async updateNode(
    @CurrentTenant() tenantId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateSandboxNodeDto,
  ): Promise<SandboxNodeEnvelopeDto> {
    this.registry.assertNodeAdmin(tenantId);
    const node = await this.registry.updateNode(nodeId, dto);
    return { data: serializeNode(node) };
  }

  @Delete(':nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Deregister a disabled sandbox runtime node' })
  @ApiResponse({ status: 204, description: 'Sandbox runtime node deleted' })
  async deleteNode(
    @CurrentTenant() tenantId: string,
    @Param('nodeId') nodeId: string,
    // 依赖全局 ZodValidationPipe：schema 带 transform，再挂一道显式 pipe 会对
    // 已转换过的值二次校验（boolean 撞上 string enum）而必然 422。
    @Query() query: DeleteSandboxNodeQueryDto,
  ): Promise<void> {
    this.registry.assertNodeAdmin(tenantId);
    await this.registry.removeNode(nodeId, query.force);
  }
}

function serializeNode(node: SandboxRuntimeNode): SandboxNodeResponseDto {
  return {
    id: node.id,
    baseUrl: node.baseUrl,
    serverName: node.serverName,
    status: node.status,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}
