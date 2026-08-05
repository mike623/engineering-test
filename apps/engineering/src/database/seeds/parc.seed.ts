import { DataSource } from "typeorm";
import { ParcModel } from "../../entities/parc/parc.model";
import { buildParc } from "../factories/parc.factory";

export const seedParcs = async (dataSource: DataSource, count = 20): Promise<ParcModel[]> => {
  const parcs = Array.from({ length: count }, (_, index) => buildParc(index));

  return dataSource.getRepository(ParcModel).save(parcs);
};
