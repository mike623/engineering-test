import { Module } from '@nestjs/common';
import { BookingsModule } from './bookings/bookings.module';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { ParcsModule } from './parcs/parcs.module';
import { UsersModule } from './users/users.module';

@Module({ imports: [CoreModule, HealthModule, ParcsModule, UsersModule, BookingsModule] })
export class AppModule {}
