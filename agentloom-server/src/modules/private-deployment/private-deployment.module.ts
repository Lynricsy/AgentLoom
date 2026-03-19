import { Module } from '@nestjs/common';
import { ApiKeyModule } from '../api-key/api-key.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { PrivateDeploymentController } from './private-deployment.controller';
import { PrivateDeploymentService } from './private-deployment.service';

@Module({
  imports: [ApiKeyModule, EvidenceModule],
  controllers: [PrivateDeploymentController],
  providers: [PrivateDeploymentService],
  exports: [PrivateDeploymentService],
})
export class PrivateDeploymentModule {}
