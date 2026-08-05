import { v4 as uuidv4 } from "uuid";
import { BookingModel } from "../../entities/booking/booking.model";

export const buildBooking = (userId: string, parcId: string): BookingModel => {
  const booking = new BookingModel();

  booking.id = uuidv4();
  booking.user = userId;
  booking.parc = parcId;
  booking.bookingdate = new Date().toISOString();
  booking.comments = "Seeded booking";

  return booking;
};
