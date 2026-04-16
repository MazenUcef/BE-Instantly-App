import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const withRelations = {
  biometrics: true,
  governments: { include: { government: true } },
} as const;

export class UserRepository {
  static findByEmail(email: string, tx?: Tx) {
    return (tx ?? prisma).user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: withRelations,
    });
  }

  static findByPhone(phoneNumber: string, tx?: Tx) {
    return (tx ?? prisma).user.findUnique({
      where: { phoneNumber },
      include: withRelations,
    });
  }

  static findByEmailOrPhone(email: string, phoneNumber: string, tx?: Tx) {
    return (tx ?? prisma).user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase().trim() }, { phoneNumber }],
      },
      include: withRelations,
    });
  }

  static findById(userId: string, tx?: Tx) {
    return (tx ?? prisma).user.findUnique({
      where: { id: userId },
      include: withRelations,
    });
  }

  static createUser(
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber: string;
      password: string;
      role?: any;
      address: string;
      profilePicture?: string | null;
      categoryId?: string | null;
      governmentIds?: string[];
      jobTitles?: string[];
      isEmailVerified?: boolean;
      isPhoneVerified?: boolean;
      isProfileComplete?: boolean;
    },
    tx?: Tx,
  ) {
    const { governmentIds, ...rest } = data;
    return (tx ?? prisma).user.create({
      data: {
        ...rest,
        email: rest.email.toLowerCase().trim(),
        profilePicture: rest.profilePicture ?? null,
        jobTitles: rest.jobTitles ?? [],
        governments: governmentIds?.length
          ? {
              create: governmentIds.map((governmentId) => ({ governmentId })),
            }
          : undefined,
      },
      include: withRelations,
    });
  }

  static async updateById(
    userId: string,
    updates: Prisma.UserUpdateInput & { governmentIds?: string[] },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const { governmentIds, ...rest } = updates as any;

    if (governmentIds) {
      await client.userGovernment.deleteMany({ where: { userId } });
      await client.userGovernment.createMany({
        data: governmentIds.map((governmentId: string) => ({
          userId,
          governmentId,
        })),
        skipDuplicates: true,
      });
    }

    return client.user.update({
      where: { id: userId },
      data: rest,
      include: withRelations,
    });
  }

  static deleteById(userId: string, tx?: Tx) {
    return (tx ?? prisma).user.delete({ where: { id: userId } });
  }

  static listUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: withRelations,
    });
  }

  static async findSupplierIdsByCategoryAndGovernment(
    categoryId: string,
    governmentId: string,
    excludeUserId?: string,
  ): Promise<string[]> {
    const suppliers = await prisma.user.findMany({
      where: {
        role: "supplier",
        categoryId,
        governments: { some: { governmentId } },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return suppliers.map((s) => s.id);
  }

  static findByBiometricDevice(deviceId: string) {
    return prisma.user.findFirst({
      where: { biometrics: { some: { deviceId } } },
      include: withRelations,
    });
  }
}
