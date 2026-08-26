import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { UsersModule } from '../users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [UpstreamModule, CacheModule, UsersModule],
  controllers: [HealthController],
})
export class HealthModule {}
