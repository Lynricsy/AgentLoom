import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = PostgresJsDatabase<typeof schema> & { $client: Sql };

@Injectable()
class DatabaseLifecycleService implements OnModuleDestroy {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleDestroy() {
    await this.db.$client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DrizzleDB => {
        const databaseUrl = configService.get<string>('APP_DATABASE_URL')!;
        const client = postgres(databaseUrl, {
          max: 20,
          idle_timeout: 30,
        });
        return drizzle(client, { schema });
      },
    },
    DatabaseLifecycleService,
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
