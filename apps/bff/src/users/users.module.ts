import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [UpstreamModule, CacheModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
