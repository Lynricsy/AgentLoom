import { Module } from '@nestjs/common';
import { DecisionController } from './decision.controller';
import { DecisionService } from './decision.service';
import { JevClient } from './providers/jev-client';
import { JevDecisionProvider } from './providers/jev-decision.provider';
import { RuleDecisionProvider } from './providers/rule-decision.provider';

/** 可替换决策服务：规则主结果 + TypeSafe Jev 影子记录 */
@Module({
  controllers: [DecisionController],
  providers: [
    DecisionService,
    RuleDecisionProvider,
    JevClient,
    JevDecisionProvider,
  ],
  exports: [DecisionService],
})
export class DecisionModule {}
