import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import { ConfigOptions } from "../../config";
import { BookingModel } from "../../entities/booking/booking.model";
import { ParcModel } from "../../entities/parc/parc.model";
import { UserModel } from "../../entities/user/user.model";
import { seedUsers } from "./user.seed";
import { seedParcs } from "./parc.seed";
import { seedBookings } from "./booking.seed";

const run = async (): Promise<void> => {
  const dataSource = new DataSource(ConfigOptions as DataSourceOptions);

  try {
    await dataSource.initialize();

    // Reset tables so repeated seed runs are predictable.
    await dataSource.getRepository(BookingModel).delete({});
    await dataSource.getRepository(ParcModel).delete({});
    await dataSource.getRepository(UserModel).delete({});

    const users = await seedUsers(dataSource, 30);
    const parcs = await seedParcs(dataSource, 20);
    const bookings = await seedBookings(
      dataSource,
      users.map((user) => user.id),
      parcs.map((parc) => parc.id),
      10,
    );

    // Keep output terse but useful for CI and local verification.
    console.log(`Seeded users=${users.length}, parcs=${parcs.length}, bookings=${bookings.length}`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
};

run().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});


