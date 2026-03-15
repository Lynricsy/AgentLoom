import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { EvidenceGraphService } from './evidence-graph.service';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [LlmModule],
  controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceGraphService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
