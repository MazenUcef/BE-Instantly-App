import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

export class GovernmentRepository {
  static findActive(tx?: Tx) {
    return (tx ?? prisma).government.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
  }

  static findAll(tx?: Tx) {
    return (tx ?? prisma).government.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
  }

  static findById(governmentId: string, tx?: Tx) {
    return (tx ?? prisma).government.findUnique({
      where: { id: governmentId },
    });
  }

  static findByNormalizedNames(
    normalizedName: string,
    normalizedNameAr: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).government.findFirst({
      where: {
        OR: [{ normalizedName }, { normalizedNameAr }],
      },
    });
  }

  static create(
    data: {
      name: string;
      nameAr: string;
      normalizedName: string;
      normalizedNameAr: string;
      country: string;
      isActive?: boolean;
      order?: number;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).government.create({ data });
  }

  static updateById(
    governmentId: string,
    updates: Prisma.GovernmentUpdateInput,
    tx?: Tx,
  ) {
    return (tx ?? prisma).government.update({
      where: { id: governmentId },
      data: updates,
    });
  }
}
