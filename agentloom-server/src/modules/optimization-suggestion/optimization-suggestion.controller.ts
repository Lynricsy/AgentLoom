import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  QueryStatsDto,
  QuerySuggestionsDto,
} from './dto/optimization-suggestion.dto';
import { OptimizationSuggestionService } from './optimization-suggestion.service';

@ApiTags('Optimization Suggestions')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Roles('operator', 'creator', 'admin', 'owner')
@Controller('optimization-suggestions')
export class OptimizationSuggestionController {
  constructor(
    private readonly optimizationSuggestionService: OptimizationSuggestionService,
  ) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: '返回当前组织的优化建议列表',
  })
  async list(@Query() query: QuerySuggestionsDto) {
    if (query.workflowDefinitionId && query.nodeId) {
      return {
        data: await this.optimizationSuggestionService.findByWorkflowAndNode(
          query.workflowDefinitionId,
          query.nodeId,
          query.status,
        ),
      };
    }

    return {
      data: await this.optimizationSuggestionService.findByTenant(query),
    };
  }

  @Get('stats')
  @ApiResponse({
    status: 200,
    description: '返回当前组织的优化建议统计信息',
  })
  async getStats(@Query() query: QueryStatsDto) {
    return {
      data: await this.optimizationSuggestionService.getAdoptionStats(
        query.workflowDefinitionId,
      ),
    };
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '应用指定的优化建议',
  })
  async apply(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.optimizationSuggestionService.applySuggestion(
        id,
        userId,
      ),
    };
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '忽略指定的优化建议',
  })
  async dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return {
      data: await this.optimizationSuggestionService.dismissSuggestion(
        id,
        userId,
      ),
    };
  }
}
