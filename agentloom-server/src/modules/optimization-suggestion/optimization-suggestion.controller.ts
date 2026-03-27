import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';

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
  async getStats(@Query() query: QueryStatsDto) {
    return {
      data: await this.optimizationSuggestionService.getAdoptionStats(
        query.workflowDefinitionId,
      ),
    };
  }

  @Post(':id/apply')
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
