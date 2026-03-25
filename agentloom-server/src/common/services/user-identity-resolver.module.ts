import { Global, Module } from '@nestjs/common';
import { UserIdentityResolverService } from './user-identity-resolver.service';

@Global()
@Module({
  providers: [UserIdentityResolverService],
  exports: [UserIdentityResolverService],
})
export class UserIdentityResolverModule {}
