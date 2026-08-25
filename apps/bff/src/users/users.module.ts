import { Module } from '@nestjs/common';
import { UpstreamModule } from '../upstream/upstream.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [UpstreamModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
