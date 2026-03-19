import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DRIZZLE } from '../../database/database.module';
import { AuditLogService } from '../evidence/audit-log.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { ResourceGovernanceController } from './resource-governance.controller';
import { ResourceGovernanceService } from './resource-governance.service';

@Module({
  imports: [EvidenceModule],
  controllers: [ResourceGovernanceController],
  providers: [
    {
      provide: ResourceGovernanceService,
      inject: [DRIZZLE, AuditLogService, EventEmitter2],
      useFactory: (
        db: ConstructorParameters<typeof ResourceGovernanceService>[0],
        auditLogService: ConstructorParameters<typeof ResourceGovernanceService>[1],
        eventEmitter: ConstructorParameters<typeof ResourceGovernanceService>[2],
      ) => new ResourceGovernanceService(db, auditLogService, eventEmitter),
    },
  ],
  exports: [ResourceGovernanceService],
})
export class ResourceGovernanceModule {}
