import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ParcsModule } from './parcs/parcs.module';
import { UpstreamExceptionFilter } from './upstream/upstream-exception.filter';
import { UsersModule } from './users/users.module';

@Module({
  imports: [ParcsModule, UsersModule],
  providers: [{ provide: APP_FILTER, useClass: UpstreamExceptionFilter }],
})
export class AppModule {}
