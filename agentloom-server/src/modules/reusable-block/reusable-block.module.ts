import { Module } from '@nestjs/common';

import { ReusableBlockController } from './reusable-block.controller';
import { ReusableBlockService } from './reusable-block.service';

@Module({
  controllers: [ReusableBlockController],
  providers: [ReusableBlockService],
  exports: [ReusableBlockService],
})
export class ReusableBlockModule {}
