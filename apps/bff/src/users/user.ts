import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class User {
  @Expose()
  @IsUUID()
  id!: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Expose()
  // Upstream accepts an unvalidated body on POST /users, so a badly formed
  // address is a realistic thing to read back.
  @IsEmail()
  email!: string;
}
