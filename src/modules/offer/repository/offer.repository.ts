import { OfferStatus, Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const HISTORY_STATUSES: OfferStatus[] = [
  OfferStatus.accepted,
  OfferStatus.completed,
  OfferStatus.withdrawn,
];

export class OfferRepository {
  static createOffer(
    data: {
      orderId: string;
      supplierId: string;
      amount: number;
      estimatedDuration?: number | null;
      expectedDays?: number | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
      status?: OfferStatus;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.create({
      data: {
        orderId: data.orderId,
        supplierId: data.supplierId,
        amount: new Prisma.Decimal(data.amount),
        estimatedDuration: data.estimatedDuration ?? null,
        expectedDays: data.expectedDays ?? null,
        timeToStart: data.timeToStart ? new Date(data.timeToStart) : null,
        expiresAt: data.expiresAt ?? null,
        status: data.status ?? OfferStatus.pending,
      },
    });
  }

  static findById(offerId: string, tx?: Tx) {
    return (tx ?? prisma).offer.findUnique({ where: { id: offerId } });
  }

  static findPendingOfferBySupplierAndOrder(
    supplierId: string,
    orderId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.findFirst({
      where: { supplierId, orderId, status: OfferStatus.pending },
    });
  }

  static findAcceptedOfferBySupplier(supplierId: string, tx?: Tx) {
    return (tx ?? prisma).offer.findFirst({
      where: { supplierId, status: OfferStatus.accepted },
      orderBy: { createdAt: "desc" },
    });
  }

  static findPendingOffersBySupplier(supplierId: string, tx?: Tx) {
    return (tx ?? prisma).offer.findMany({
      where: { supplierId, status: OfferStatus.pending },
      orderBy: { createdAt: "desc" },
    });
  }

  static countPendingOffersBySupplier(supplierId: string) {
    return prisma.offer.count({
      where: { supplierId, status: OfferStatus.pending },
    });
  }

  static findPendingOffersByOrder(orderId: string, tx?: Tx) {
    return (tx ?? prisma).offer.findMany({
      where: { orderId, status: OfferStatus.pending },
      orderBy: { createdAt: "desc" },
    });
  }

  static findOrderOffers(orderId: string) {
    return prisma.offer.findMany({
      where: {
        orderId,
        status: { in: [OfferStatus.pending, OfferStatus.accepted] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static findSupplierOfferForOrder(orderId: string, supplierId: string) {
    return prisma.offer.findMany({
      where: {
        orderId,
        supplierId,
        status: { in: [OfferStatus.pending, OfferStatus.accepted] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updatePendingOffer(
    offerId: string,
    data: {
      amount: number;
      estimatedDuration?: number | null;
      expectedDays?: number | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, status: OfferStatus.pending },
      data: {
        amount: new Prisma.Decimal(data.amount),
        estimatedDuration: data.estimatedDuration ?? null,
        expectedDays: data.expectedDays ?? null,
        timeToStart: data.timeToStart ? new Date(data.timeToStart) : null,
        expiresAt: data.expiresAt ?? null,
      },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static findSupplierScheduledWindows(
    supplierId: string,
    excludeOfferId?: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.findMany({
      where: {
        supplierId,
        status: OfferStatus.accepted,
        timeToStart: { not: null },
        estimatedDuration: { not: null },
        ...(excludeOfferId ? { NOT: { id: excludeOfferId } } : {}),
      },
      select: { id: true, timeToStart: true, estimatedDuration: true },
    });
  }

  static async acceptPendingOffer(offerId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, status: OfferStatus.pending },
      data: { status: OfferStatus.accepted, acceptedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static async rejectPendingOffer(offerId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, status: OfferStatus.pending },
      data: { status: OfferStatus.rejected, rejectedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static rejectOtherOffersForOrder(
    orderId: string,
    acceptedOfferId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.updateMany({
      where: {
        orderId,
        NOT: { id: acceptedOfferId },
        status: OfferStatus.pending,
      },
      data: { status: OfferStatus.rejected, rejectedAt: new Date() },
    });
  }

  static rejectOtherPendingOffersForSupplier(
    supplierId: string,
    acceptedOfferId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.updateMany({
      where: {
        supplierId,
        NOT: { id: acceptedOfferId },
        status: OfferStatus.pending,
      },
      data: { status: OfferStatus.rejected, rejectedAt: new Date() },
    });
  }

  static findSupplierOtherPendingOffers(
    supplierId: string,
    excludeOfferId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).offer.findMany({
      where: {
        supplierId,
        status: OfferStatus.pending,
        NOT: { id: excludeOfferId },
      },
    });
  }

  static async withdrawPendingOfferBySupplier(
    offerId: string,
    supplierId: string,
    reason: string,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, supplierId, status: OfferStatus.pending },
      data: { status: OfferStatus.withdrawn, withdrawnAt: new Date(), withdrawnReason: reason },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static async withdrawAcceptedOfferBySupplier(
    offerId: string,
    supplierId: string,
    reason: string,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, supplierId, status: OfferStatus.accepted },
      data: { status: OfferStatus.withdrawn, withdrawnAt: new Date(), withdrawnReason: reason },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static async markCompleted(offerId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.offer.updateMany({
      where: { id: offerId, status: OfferStatus.accepted },
      data: { status: OfferStatus.completed, completedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.offer.findUnique({ where: { id: offerId } });
  }

  static findSupplierAcceptedOffersHistory(
    supplierId: string,
    page = 1,
    limit = 20,
  ) {
    return prisma.offer.findMany({
      where: { supplierId, status: { in: HISTORY_STATUSES } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  static countSupplierAcceptedOffersHistory(supplierId: string) {
    return prisma.offer.count({
      where: { supplierId, status: { in: HISTORY_STATUSES } },
    });
  }

  static findSupplierPendingOffersPaginated(
    supplierId: string,
    page = 1,
    limit = 20,
  ) {
    return prisma.offer.findMany({
      where: { supplierId, status: OfferStatus.pending },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
