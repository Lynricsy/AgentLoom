import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  GeneratedAppController,
  GeneratedAppPublicController,
} from './generated-app.controller';
import { GeneratedAppService } from './generated-app.service';

@Module({
  imports: [ConfigModule],
  controllers: [GeneratedAppController, GeneratedAppPublicController],
  providers: [GeneratedAppService],
  exports: [GeneratedAppService],
})
export class GeneratedAppModule {}
