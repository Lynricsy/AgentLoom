import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyModule } from '../api-key/api-key.module';
import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [ConfigModule, ApiKeyModule, ResourceSourceModule],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
