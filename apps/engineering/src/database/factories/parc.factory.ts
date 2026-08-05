import { v4 as uuidv4 } from "uuid";
import { ParcModel } from "../../entities/parc/parc.model";

export const buildParc = (index: number): ParcModel => {
  const parc = new ParcModel();

  parc.id = uuidv4();
  parc.name = `Parc ${index + 1}`;
  parc.description = `Demo description for parc ${index + 1}`;

  return parc;
};
