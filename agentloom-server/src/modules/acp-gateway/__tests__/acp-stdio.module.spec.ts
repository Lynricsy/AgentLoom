import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { InProcessAgentAdapter } from '../../agent/in-process-agent.adapter';
import { AGENT_RUNTIME } from '../../agent/ports/agent-runtime.port';
import { AgentSessionFactory } from '../../execution/services/agent-session-factory.service';
import { SessionPersistenceService } from '../../execution/services/session-persistence.service';
import { LlmModule } from '../../llm/llm.module';
import { ACP_TEST_RUNTIME_PROVIDER } from '../testing/acp-test-runtime';

const ACP_STDIO_TEST_ENV = {
  APP_DEPLOYMENT_MODE: 'private',
  APP_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agentloom',
  APP_JWT_SECRET: 'test-jwt-secret',
  APP_REDIS_URL: 'redis://localhost:6379',
  APP_MASTER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  APP_OAUTH_REDIRECT_URL: 'http://localhost:3000/auth/callback',
  APP_FRONTEND_URL: 'http://localhost:5173',
  APP_SUPABASE_URL: '',
  APP_SUPABASE_ANON_KEY: '',
  APP_SUPABASE_SERVICE_KEY: '',
} as const;

describe('AcpStdioModule', () => {
  it(
    '应将 AGENT_RUNTIME 绑定到真实 runtime provider',
    { timeout: 30_000 },
    async () => {
      const acpStdioModulePath = '../acp-stdio.module.ts';

      for (const [key, value] of Object.entries(ACP_STDIO_TEST_ENV)) {
        process.env[key] = value;
      }

      const { AcpStdioModule } = await import(acpStdioModulePath);
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        AcpStdioModule,
      ) as unknown[] | undefined;
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        AcpStdioModule,
      ) as Array<unknown> | undefined;

      expect(imports).toEqual(expect.arrayContaining([LlmModule]));
      expect(providers).toEqual(
        expect.arrayContaining([
          AgentSessionFactory,
          SessionPersistenceService,
          InProcessAgentAdapter,
          expect.objectContaining({
            provide: AGENT_RUNTIME,
            inject: [InProcessAgentAdapter, SessionPersistenceService],
            useFactory: ACP_TEST_RUNTIME_PROVIDER.useFactory,
          }),
        ]),
      );
    },
  );
});
