import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { ParcsModule } from '../parcs/parcs.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { UsersModule } from '../users/users.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [UpstreamModule, CacheModule, UsersModule, ParcsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
