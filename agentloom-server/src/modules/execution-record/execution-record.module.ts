import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ExecutionRecordController } from './execution-record.controller';
import { ExecutionRecordService } from './execution-record.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ExecutionRecordController],
  providers: [ExecutionRecordService],
  exports: [ExecutionRecordService],
})
export class ExecutionRecordModule {}
