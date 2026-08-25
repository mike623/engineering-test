import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { ParcsController } from './parcs.controller';
import { ParcsService } from './parcs.service';

@Module({
  imports: [UpstreamModule, CacheModule],
  controllers: [ParcsController],
  providers: [ParcsService],
  exports: [ParcsService],
})
export class ParcsModule {}
