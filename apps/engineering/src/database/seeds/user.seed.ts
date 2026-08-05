import { DataSource } from "typeorm";
import { UserModel } from "../../entities/user/user.model";
import { buildUser } from "../factories/user.factory";

export const seedUsers = async (dataSource: DataSource, count = 30): Promise<UserModel[]> => {
  const users = Array.from({ length: count }, (_, index) => buildUser(index));

  return dataSource.getRepository(UserModel).save(users);
};
