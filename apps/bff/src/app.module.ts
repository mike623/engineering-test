import { Module } from '@nestjs/common';
import { ParcsModule } from './parcs/parcs.module';

@Module({ imports: [ParcsModule] })
export class AppModule {}
