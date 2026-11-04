import { HttpStatus } from '@nestjs/common';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { problemType } from '../../../common/exceptions/problem-type';
import type { WebSearchFailure } from './web-search.types';

/** 回退链上所有已配置的搜索后端都失败 */
export class WebSearchUnavailableException extends DomainException {
  readonly failures: WebSearchFailure[];

  constructor(failures: WebSearchFailure[]) {
    super({
      type: problemType('web-search-unavailable'),
      title: '网页搜索不可用',
      status: HttpStatus.BAD_GATEWAY,
      detail:
        failures.length > 0
          ? `所有搜索后端均失败：${formatWebSearchFailures(failures)}`
          : '没有可用的搜索后端：请检查 APP_WEB_SEARCH_PROVIDERS 与对应 API Key',
      extensions: { failures },
    });
    this.failures = failures;
  }
}

export function formatWebSearchFailures(failures: WebSearchFailure[]): string {
  return failures
    .map((failure) => `${failure.id}: ${failure.reason}`)
    .join('; ');
}
