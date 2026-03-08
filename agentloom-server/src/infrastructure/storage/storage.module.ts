import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { MINIO_CLIENT } from './storage.constants';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: MINIO_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Minio.Client({
          endPoint: configService.getOrThrow<string>('APP_MINIO_ENDPOINT'),
          port: configService.getOrThrow<number>('APP_MINIO_PORT'),
          accessKey: configService.getOrThrow<string>('APP_MINIO_ACCESS_KEY'),
          secretKey: configService.getOrThrow<string>('APP_MINIO_SECRET_KEY'),
          useSSL: configService.get<boolean>('APP_MINIO_USE_SSL', false),
        });
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [MINIO_CLIENT, StorageService],
})
export class StorageModule {}
