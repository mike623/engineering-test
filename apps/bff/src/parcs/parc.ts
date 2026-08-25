import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * What we require of an upstream parc before we will pass it on. Upstream
 * mints ids with `uuid()` and its columns are non-nullable, so anything
 * failing this arrived through a route that skipped those guarantees.
 */
export class Parc {
  @Expose()
  @IsUUID()
  id!: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  description!: string;
}
