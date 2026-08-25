import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { reportCacheState, reportDropped } from '../http/response-metadata';
import { User } from './user';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<User[]> {
    const { items, dropped } = await this.users.findAll();

    reportCacheState(response, 'miss');
    reportDropped(response, dropped);

    return items;
  }
}
