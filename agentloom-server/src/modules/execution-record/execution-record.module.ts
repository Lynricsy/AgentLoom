import { Module } from '@nestjs/common';

import { ExecutionRecordController } from './execution-record.controller';
import { ExecutionRecordService } from './execution-record.service';

@Module({
  controllers: [ExecutionRecordController],
  providers: [ExecutionRecordService],
  exports: [ExecutionRecordService],
})
export class ExecutionRecordModule {}
