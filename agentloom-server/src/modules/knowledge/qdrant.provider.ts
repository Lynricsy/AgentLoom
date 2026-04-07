import { QdrantClient } from '@qdrant/js-client-rest';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';

export const QDRANT_CLIENT = Symbol('QDRANT_CLIENT');

export const qdrantClientProvider = {
  provide: QDRANT_CLIENT,
  useFactory: (config: ConfigService<EnvConfig, true>) => {
    const url = config.get('APP_QDRANT_URL', { infer: true });
    return new QdrantClient({
      url,
      checkCompatibility:
        process.env.NODE_ENV === 'test' &&
        process.env.ACP_TEST_FAKE_RUNTIME === '1'
          ? false
          : true,
    });
  },
  inject: [ConfigService],
};
