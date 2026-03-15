import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ShareController } from './share.controller';
import { SharePublicController } from './share-public.controller';
import { ShareService } from './share.service';

@Module({
  imports: [ConfigModule],
  controllers: [ShareController, SharePublicController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
