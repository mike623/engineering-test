import { Expose } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

/** A booking exactly as upstream stores it: references, not names. */
export class Booking {
  @Expose()
  @IsUUID()
  id!: string;

  @Expose()
  @IsUUID()
  user!: string;

  @Expose()
  @IsUUID()
  parc!: string;

  @Expose()
  @IsDateString()
  bookingdate!: string;

  @Expose()
  @IsOptional()
  @IsString()
  comments?: string;
}

/** A reference we managed to resolve, or `null` where we could not. */
export interface Named {
  id: string;
  name: string;
}

export interface EnrichedBooking {
  id: string;
  bookingDate: string;
  comments?: string;
  user: Named | null;
  parc: Named | null;
}
