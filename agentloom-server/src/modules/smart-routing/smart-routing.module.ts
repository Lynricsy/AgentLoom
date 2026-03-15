import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { SmartRoutingController } from './smart-routing.controller';
import { SmartRoutingService } from './smart-routing.service';

@Module({
  imports: [LlmModule],
  controllers: [SmartRoutingController],
  providers: [SmartRoutingService],
  exports: [SmartRoutingService],
})
export class SmartRoutingModule {}
