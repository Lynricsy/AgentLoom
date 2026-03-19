import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenBlacklistModule } from '../../common/services/token-blacklist.module';
import { DatabaseModule } from '../../database/database.module';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { AcpAuthenticationService } from './acp-authentication.service';
import { AcpGatewayService } from './acp-gateway.service';
import { AcpMessageRouter } from './acp-message-router';
import { AuthenticateHandler } from './handlers/authenticate.handler';
import { InitializeHandler } from './handlers/initialize.handler';
import { SessionCancelHandler } from './handlers/session-cancel.handler';
import { SessionLoadHandler } from './handlers/session-load.handler';
import { SessionNewHandler } from './handlers/session-new.handler';
import { SessionPromptHandler } from './handlers/session-prompt.handler';

@Module({
  imports: [ConfigModule, DatabaseModule, TokenBlacklistModule],
  providers: [
    AcpAuthenticationService,
    SessionPersistenceService,
    InitializeHandler,
    AuthenticateHandler,
    SessionNewHandler,
    SessionLoadHandler,
    SessionPromptHandler,
    SessionCancelHandler,
    AcpMessageRouter,
    AcpGatewayService,
  ],
  exports: [AcpGatewayService],
})
export class AcpGatewayModule {}
