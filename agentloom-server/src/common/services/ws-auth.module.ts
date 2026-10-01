import { Global, Module } from '@nestjs/common';
import { WsAuthService } from './ws-auth.service';

@Global()
@Module({
  providers: [WsAuthService],
  exports: [WsAuthService],
})
export class WsAuthModule {}
