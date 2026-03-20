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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 409, description: '邮箱已存在' })
  @ApiResponse({ status: 422, description: '请求验证失败（含密码强度校验）' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '凭据无效' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token 刷新' })
  @ApiResponse({ status: 200, description: '刷新成功' })
  @ApiResponse({ status: 401, description: 'Refresh token 无效' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '用户登出' })
  @ApiResponse({ status: 204, description: '登出成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 500, description: '会话注销失败' })
  logout(@Req() request: FastifyRequest) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.logout(token!);
  }

  @Get('security')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户安全信息' })
  @ApiResponse({ status: 200, description: '获取安全信息成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  getSecurityInfo(@Req() request: FastifyRequest) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.getSecurityInfo(token!);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改当前用户密码' })
  @ApiResponse({ status: 200, description: '密码修改成功' })
  @ApiResponse({ status: 400, description: '新密码与当前密码相同' })
  @ApiResponse({ status: 401, description: '当前密码错误或未认证' })
  changePassword(
    @Req() request: FastifyRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.changePassword(
      token!,
      dto.current_password,
      dto.new_password,
    );
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户所有活跃会话' })
  @ApiResponse({ status: 200, description: '获取会话列表成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  listSessions(@Req() request: FastifyRequest) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.listSessions(token!);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销指定会话' })
  @ApiResponse({ status: 200, description: '会话撤销成功' })
  @ApiResponse({ status: 400, description: '不能撤销当前会话' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  revokeSession(
    @Param('id') sessionId: string,
    @Req() request: FastifyRequest,
  ) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.revokeSession(token!, sessionId);
  }

  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销当前用户的所有其他会话' })
  @ApiResponse({ status: 200, description: '会话批量撤销成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  revokeAllSessions(@Req() request: FastifyRequest) {
    const token = request.headers.authorization?.split(' ')[1];
    return this.authService.revokeAllSessions(token!);
  }
}
