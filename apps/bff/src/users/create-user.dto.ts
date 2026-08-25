import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Upstream takes an untyped body and has no unique constraint on `email`, so
 * this is the only place either is checked.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;
}
