import { DataSource } from "typeorm";
import { BookingModel } from "../../entities/booking/booking.model";
import { buildBooking } from "../factories/booking.factory";

export const seedBookings = async (
  dataSource: DataSource,
  userIds: string[],
  parcIds: string[],
  count = 10,
): Promise<BookingModel[]> => {
  const bookings = Array.from({ length: count }, (_, index) => {
    const userId = userIds[index % userIds.length];
    const parcId = parcIds[index % parcIds.length];

    return buildBooking(userId, parcId);
  });

  return dataSource.getRepository(BookingModel).save(bookings);
};
