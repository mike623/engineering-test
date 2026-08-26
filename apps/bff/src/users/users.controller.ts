import { Body, Controller, Get, HttpException, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { reportAge, reportCacheState, reportDropped } from '../http/response-metadata';
import { CreateUserDto } from './create-user.dto';
import { User } from './user';
import { UsersService } from './users.service';

const RETRY_AFTER_SECONDS = 10;

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async findAll(
    @Res({ passthrough: true }) response: Response,
    @Query('retry') retry?: string,
  ): Promise<User[]> {
    const { value, state, ageMs } = await this.users.findAll({ force: retry === 'true' });

    reportCacheState(response, state);
    reportAge(response, ageMs);
    reportDropped(response, value.dropped);

    return value.items;
  }

  @Post()
  async create(
    @Body() payload: CreateUserDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<User> {
    const outcome = await this.users.create(payload);

    switch (outcome.status) {
      case 'created':
        // A recovered create is indistinguishable from an ordinary one here.
        // The distinction matters to us, not to the caller, so it lives in the
        // log line and the counter. See ADR 0001.
        response.status(201);

        return outcome.user;

      case 'conflict':
        throw new HttpException(
          { statusCode: 409, code: 'EMAIL_IN_USE', message: 'That address is already registered' },
          409,
        );

      case 'precheck-failed':
        // Nothing was written, so this is safely retryable — and saying so is
        // the whole point of separating it from the outcomes below.
        response.setHeader('Retry-After', RETRY_AFTER_SECONDS);
        throw new HttpException(
          {
            statusCode: 503,
            code: 'PRECHECK_FAILED',
            message: 'Could not check the address before writing. Nothing was created.',
          },
          503,
        );

      case 'failed':
        throw new HttpException(
          {
            statusCode: 502,
            code: 'WRITE_FAILED',
            message: 'The user was not created. Nothing was written.',
          },
          502,
        );

      case 'unconfirmed':
        throw new HttpException(
          {
            statusCode: 502,
            code: 'WRITE_UNCONFIRMED',
            message:
              'The user may or may not have been created. Check before trying again.',
          },
          502,
        );
    }
  }
}
