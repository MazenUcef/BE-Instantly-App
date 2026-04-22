import { AddressType, Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

export interface ISavedAddressInput {
  userId: string;
  type: AddressType;
  label?: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}

export class AddressRepository {
  static findByUser(userId: string, type?: AddressType, tx?: Tx) {
    return (tx ?? prisma).savedAddress.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  static findById(id: string, tx?: Tx) {
    return (tx ?? prisma).savedAddress.findUnique({ where: { id } });
  }

  static findByUserAndType(userId: string, type: AddressType, tx?: Tx) {
    return (tx ?? prisma).savedAddress.findFirst({
      where: { userId, type },
    });
  }

  static create(data: ISavedAddressInput, tx?: Tx) {
    return (tx ?? prisma).savedAddress.create({
      data: {
        userId: data.userId,
        type: data.type,
        label: data.label ?? null,
        address: data.address,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      },
    });
  }

  static updateById(
    id: string,
    updates: Partial<Omit<ISavedAddressInput, "userId">>,
    tx?: Tx,
  ) {
    return (tx ?? prisma).savedAddress.update({
      where: { id },
      data: updates,
    });
  }

  static deleteById(id: string, tx?: Tx) {
    return (tx ?? prisma).savedAddress.delete({ where: { id } });
  }
}
