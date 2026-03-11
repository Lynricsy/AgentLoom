import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';
import { TemplateService } from './template.service';
import { ListTemplatesQueryDto } from './dto/template.dto';

@Public()
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  async list(@Query() query: ListTemplatesQueryDto) {
    return this.templateService.findAll(
      query.category,
      query.page,
      query.pageSize,
    );
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    return this.templateService.findBySlug(slug);
  }
}
