import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";
import { DEFAULT_WEEKLY_SCHEDULE } from "../../../shared/constants/availability.constants";

type Tx = Prisma.TransactionClient;

const withChildren = {
  weeklySchedule: { orderBy: { dayOfWeek: "asc" as const } },
  blockedDates: { orderBy: { date: "asc" as const } },
};

export class AvailabilityRepository {
  static findBySupplierId(supplierId: string, tx?: Tx) {
    return (tx ?? prisma).supplierAvailability.findUnique({
      where: { supplierId },
      include: withChildren,
    });
  }

  static createDefaultForSupplier(supplierId: string, tx?: Tx) {
    return (tx ?? prisma).supplierAvailability.create({
      data: {
        supplierId,
        weeklySchedule: {
          create: DEFAULT_WEEKLY_SCHEDULE.map((d: any) => ({
            dayOfWeek: d.dayOfWeek,
            isWorking: d.isWorking,
            startTime: d.startTime ?? null,
            endTime: d.endTime ?? null,
            slotDurationMinutes: d.slotDurationMinutes,
          })),
        },
      },
      include: withChildren,
    });
  }

  static async findOrCreateBySupplierId(supplierId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.supplierAvailability.findUnique({
      where: { supplierId },
      include: withChildren,
    });
    if (existing) return existing;
    return this.createDefaultForSupplier(supplierId, tx);
  }

  static async upsertAvailability(
    supplierId: string,
    input: {
      timezone: string;
      weeklySchedule: Array<{
        dayOfWeek: number;
        isWorking: boolean;
        startTime?: string | null;
        endTime?: string | null;
        slotDurationMinutes: number;
        breakStart?: string | null;
        breakEnd?: string | null;
      }>;
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;

    const availability = await client.supplierAvailability.upsert({
      where: { supplierId },
      create: { supplierId, timezone: input.timezone },
      update: { timezone: input.timezone },
    });

    await client.weeklyScheduleItem.deleteMany({
      where: { availabilityId: availability.id },
    });
    await client.weeklyScheduleItem.createMany({
      data: input.weeklySchedule.map((d) => ({
        availabilityId: availability.id,
        dayOfWeek: d.dayOfWeek,
        isWorking: d.isWorking,
        startTime: d.startTime ?? null,
        endTime: d.endTime ?? null,
        slotDurationMinutes: d.slotDurationMinutes,
        breakStart: d.breakStart ?? null,
        breakEnd: d.breakEnd ?? null,
      })),
    });

    return client.supplierAvailability.findUnique({
      where: { supplierId },
      include: withChildren,
    });
  }

  static async addBlockedDate(
    supplierId: string,
    blockedDate: {
      date: Date | string;
      reason?: string | null;
      isFullDay: boolean;
      startTime?: string | null;
      endTime?: string | null;
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const availability = await this.findOrCreateBySupplierId(supplierId, tx);
    await client.blockedDate.create({
      data: {
        availabilityId: availability!.id,
        date: new Date(blockedDate.date),
        reason: blockedDate.reason ?? null,
        isFullDay: blockedDate.isFullDay,
        startTime: blockedDate.startTime ?? null,
        endTime: blockedDate.endTime ?? null,
      },
    });
    return client.supplierAvailability.findUnique({
      where: { supplierId },
      include: withChildren,
    });
  }

  static async removeBlockedDate(
    supplierId: string,
    blockedDateId: string,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const availability = await client.supplierAvailability.findUnique({
      where: { supplierId },
    });
    if (!availability) return null;
    await client.blockedDate.deleteMany({
      where: { id: blockedDateId, availabilityId: availability.id },
    });
    return client.supplierAvailability.findUnique({
      where: { supplierId },
      include: withChildren,
    });
  }
}
