import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenBlacklistModule } from '../../common/services/token-blacklist.module';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogService } from '../evidence/audit-log.service';
import { SessionPersistenceService } from '../execution/services/session-persistence.service';
import { McpModule } from '../mcp/mcp.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { AcpAuthenticationService } from './acp-authentication.service';
import { AcpGatewayService } from './acp-gateway.service';
import { AcpMessageRouter } from './acp-message-router';
import { AcpFilesystemHandler } from './handlers/acp-filesystem.handler';
import { AcpTerminalHandler } from './handlers/acp-terminal.handler';
import { AuthenticateHandler } from './handlers/authenticate.handler';
import { InitializeHandler } from './handlers/initialize.handler';
import { SessionCancelHandler } from './handlers/session-cancel.handler';
import { SessionLoadHandler } from './handlers/session-load.handler';
import { SessionNewHandler } from './handlers/session-new.handler';
import { SessionPromptHandler } from './handlers/session-prompt.handler';
import { AcpFilesystemSandboxService } from './services/acp-filesystem-sandbox.service';
import { AcpFilesystemProxyService } from './services/acp-filesystem-proxy.service';
import { AcpSessionMcpRegistryService } from './services/acp-session-mcp-registry.service';
import { AcpTerminalProxyService } from './services/acp-terminal-proxy.service';
import { AcpTerminalSandboxService } from './services/acp-terminal-sandbox.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TokenBlacklistModule,
    McpModule,
    SandboxModule,
  ],
  providers: [
    AcpAuthenticationService,
    SessionPersistenceService,
    AuditLogService,
    InitializeHandler,
    AuthenticateHandler,
    SessionNewHandler,
    SessionLoadHandler,
    SessionPromptHandler,
    SessionCancelHandler,
    AcpFilesystemSandboxService,
    AcpFilesystemProxyService,
    AcpSessionMcpRegistryService,
    AcpTerminalSandboxService,
    AcpTerminalProxyService,
    AcpTerminalHandler,
    AcpFilesystemHandler,
    AcpMessageRouter,
    AcpGatewayService,
  ],
  exports: [AcpGatewayService],
})
export class AcpGatewayModule {}
