import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../../entities/user/user.model";

export const buildUser = (index: number): UserModel => {
  const user = new UserModel();

  user.id = uuidv4();
  user.name = `User ${index + 1}`;
  user.email = `user${index + 1}@example.com`;

  return user;
};
