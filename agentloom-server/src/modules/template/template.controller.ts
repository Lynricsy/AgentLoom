import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { TemplateService } from './template.service';
import { ListTemplatesQueryDto } from './dto/template.dto';

@ApiTags('Templates')
@Public()
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @ApiOperation({ summary: '获取工作流模板列表' })
  @ApiQuery({ name: 'category', required: false, description: '模板分类过滤', enum: ['analysis', 'content', 'development', 'automation', 'reporting'] })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量，默认 20' })
  @ApiResponse({ status: 200, description: '模板列表获取成功' })
  async list(@Query() query: ListTemplatesQueryDto) {
    return this.templateService.findAll(
      query.category,
      query.page,
      query.pageSize,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: '获取工作流模板详情' })
  @ApiParam({ name: 'slug', description: '模板唯一标识符' })
  @ApiResponse({ status: 200, description: '模板详情获取成功' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async detail(@Param('slug') slug: string) {
    return this.templateService.findBySlug(slug);
  }
}
