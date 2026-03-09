import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

type AuthenticatedRequest = FastifyRequest & { user: JwtPayload };

@ApiTags('Organizations')
@Controller()
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建组织' })
  @ApiResponse({ status: 201, description: '组织创建成功' })
  @ApiResponse({ status: 409, description: '组织 slug 冲突' })
  async createOrganization(
    @Body() dto: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.organizationService.createOrganization(
      request.user.sub,
      dto,
    );
    return { data: result };
  }

  @Get('organizations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取组织详情' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '组织不存在或无权限' })
  async getOrganization(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.organizationService.getOrganization(
      id,
      request.user.sub,
    );
    return { data: result };
  }

  @Post('organizations/:id/invitations')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '邀请成员加入组织' })
  @ApiResponse({ status: 201, description: '邀请发送成功' })
  @ApiResponse({ status: 403, description: '无权限邀请成员' })
  @ApiResponse({ status: 404, description: '组织不存在' })
  @ApiResponse({ status: 409, description: '已存在待处理邀请或用户已是成员' })
  async inviteMember(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.organizationService.inviteMember(
      id,
      dto,
      request.user.sub,
    );
    return { data: result };
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接受组织邀请' })
  @ApiResponse({ status: 200, description: '成功加入组织' })
  @ApiResponse({ status: 404, description: '邀请不存在' })
  @ApiResponse({ status: 410, description: '邀请已过期或已使用' })
  @ApiResponse({ status: 409, description: '已是组织成员' })
  async acceptInvitation(
    @Param('token') token: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.organizationService.acceptInvitation(
      token,
      request.user.sub,
    );
    return { data: result };
  }

  @Put('organizations/:id/members/:userId/role')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新成员角色' })
  @ApiResponse({ status: 200, description: '角色更新成功' })
  @ApiResponse({
    status: 403,
    description: '无权限修改角色（仅 Owner 可操作）',
  })
  @ApiResponse({ status: 404, description: '组织或成员不存在' })
  @ApiResponse({ status: 409, description: '不能移除唯一的所有者' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.organizationService.updateMemberRole(
      id,
      userId,
      dto,
      request.user.sub,
    );
    return { data: result };
  }

  @Delete('organizations/:id/members/:userId')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '移除组织成员' })
  @ApiResponse({ status: 204, description: '成员移除成功' })
  @ApiResponse({ status: 403, description: '无权限移除成员' })
  @ApiResponse({ status: 404, description: '组织或成员不存在' })
  @ApiResponse({ status: 409, description: '不能移除唯一的所有者' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.organizationService.removeMember(id, userId, request.user.sub);
  }
}
