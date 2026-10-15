import { Module } from '@nestjs/common';

import { AgentApiRuntimeModule } from '../agent-api-runtime/agent-api-runtime.module';
import { AgentApiModule } from '../agent-api/agent-api.module';
import { A2aController } from './a2a.controller';
import { A2aService } from './a2a.service';

@Module({
  imports: [AgentApiModule, AgentApiRuntimeModule],
  controllers: [A2aController],
  providers: [A2aService],
})
export class A2aModule {}
