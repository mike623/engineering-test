import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { User } from './user';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async findAll(@Res({ passthrough: true }) response: Response): Promise<User[]> {
    const result = await this.users.findAll();

    // Set only once the call has succeeded: a failed response has no cache
    // state to report, and claiming one would be a lie.
    response.setHeader('X-Cache', 'miss');

    return result;
  }
}
