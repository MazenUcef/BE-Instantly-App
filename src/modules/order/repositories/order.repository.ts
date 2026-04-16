import { OrderStatus, OrderType, Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profilePicture: true,
  address: true,
} as const;

const taxonomySelect = { id: true, name: true, nameAr: true } as const;
const categorySelect = { id: true, name: true } as const;

export class OrderRepository {
  static createOrder(
    data: {
      customerId: string;
      customerName: string;
      categoryId: string;
      governmentId: string;
      jobTitle: string;
      address: string;
      description: string;
      requestedPrice: number;
      orderType: OrderType;
      selectedWorkflow: string;
      expectedDays?: number | null;
      estimatedDuration?: number | null;
      timeToStart?: Date | string | null;
      images?: { url: string; publicId: string }[];
      files?: { url: string; publicId: string; originalName: string }[];
      status?: OrderStatus;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).order.create({
      data: {
        customerId: data.customerId,
        customerName: data.customerName,
        categoryId: data.categoryId,
        governmentId: data.governmentId,
        jobTitle: data.jobTitle,
        address: data.address,
        description: data.description,
        requestedPrice: new Prisma.Decimal(data.requestedPrice),
        orderType: data.orderType,
        selectedWorkflow: data.selectedWorkflow,
        expectedDays: data.expectedDays ?? null,
        estimatedDuration: data.estimatedDuration ?? null,
        timeToStart: data.timeToStart ? new Date(data.timeToStart) : null,
        images: (data.images ?? []) as unknown as Prisma.InputJsonValue,
        files: (data.files ?? []) as unknown as Prisma.InputJsonValue,
        status: data.status ?? OrderStatus.pending,
      },
    });
  }

  static findCustomerPendingOrder(customerId: string, tx?: Tx) {
    return (tx ?? prisma).order.findFirst({
      where: { customerId, status: OrderStatus.pending },
    });
  }

  static findCustomerInProgressOrder(customerId: string, tx?: Tx) {
    return (tx ?? prisma).order.findFirst({
      where: { customerId, status: OrderStatus.in_progress },
    });
  }

  static async markScheduled(
    orderId: string,
    supplierId: string,
    finalPrice: number,
    scheduledAt: Date,
    estimatedDuration: number | null,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.order.updateMany({
      where: { id: orderId, status: OrderStatus.pending },
      data: {
        status: OrderStatus.scheduled,
        supplierId,
        finalPrice: new Prisma.Decimal(finalPrice),
        scheduledAt,
        estimatedDuration,
      },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: orderId } });
  }

  static findDueScheduledOrders(tx?: Tx) {
    return (tx ?? prisma).order.findMany({
      where: {
        status: OrderStatus.scheduled,
        scheduledAt: { lte: new Date() },
      },
    });
  }

  static findCustomerScheduledWindows(customerId: string, tx?: Tx) {
    return (tx ?? prisma).order.findMany({
      where: {
        customerId,
        status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
        scheduledAt: { not: null },
        estimatedDuration: { not: null },
      },
      select: { id: true, scheduledAt: true, estimatedDuration: true },
    });
  }

  static findSupplierScheduledWindows(supplierId: string, tx?: Tx) {
    return (tx ?? prisma).order.findMany({
      where: {
        supplierId,
        status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
        scheduledAt: { not: null },
        estimatedDuration: { not: null },
      },
      select: { id: true, scheduledAt: true, estimatedDuration: true },
    });
  }

  static findScheduledOrdersForUser(input: {
    userId: string;
    role: "customer" | "supplier";
    from?: Date | null;
    to?: Date | null;
    page?: number;
    limit?: number;
  }) {
    const { userId, role, from, to, page = 1, limit = 20 } = input;
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.scheduled,
      ...(role === "customer" ? { customerId: userId } : { supplierId: userId }),
    };
    if (from || to) {
      where.scheduledAt = {};
      if (from) (where.scheduledAt as any).gte = from;
      if (to) (where.scheduledAt as any).lte = to;
    }

    return prisma.order.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: userSelect },
        supplier: { select: userSelect },
        category: { select: categorySelect },
        government: { select: taxonomySelect },
      },
    });
  }

  static countScheduledOrdersForUser(input: {
    userId: string;
    role: "customer" | "supplier";
    from?: Date | null;
    to?: Date | null;
  }) {
    const { userId, role, from, to } = input;
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.scheduled,
      ...(role === "customer" ? { customerId: userId } : { supplierId: userId }),
    };
    if (from || to) {
      where.scheduledAt = {};
      if (from) (where.scheduledAt as any).gte = from;
      if (to) (where.scheduledAt as any).lte = to;
    }
    return prisma.order.count({ where });
  }

  static findCustomerTimeline(customerId: string, page = 1, limit = 20) {
    return prisma.order.findMany({
      where: { customerId },
      orderBy: [
        { scheduledAt: "asc" },
        { timeToStart: "asc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  static countCustomerTimeline(customerId: string) {
    return prisma.order.count({ where: { customerId } });
  }

  static findById(orderId: string, tx?: Tx) {
    return (tx ?? prisma).order.findUnique({ where: { id: orderId } });
  }

  static findCustomerActiveOrder(customerId: string, tx?: Tx) {
    return (tx ?? prisma).order.findFirst({
      where: {
        customerId,
        status: {
          in: [OrderStatus.pending, OrderStatus.scheduled, OrderStatus.in_progress],
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static findCustomerPendingReviewOrder(customerId: string, tx?: Tx) {
    return (tx ?? prisma).order.findFirst({
      where: {
        customerId,
        status: OrderStatus.completed,
        customerReviewed: false,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateRequestedPrice(orderId: string, requestedPrice: number, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.order.updateMany({
      where: { id: orderId, status: OrderStatus.pending },
      data: { requestedPrice: new Prisma.Decimal(requestedPrice) },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: orderId } });
  }

  static async markCancelled(
    input: {
      orderId: string;
      customerId?: string;
      cancelledBy: any;
      cancellationReason?: string | null;
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const where: Prisma.OrderWhereInput = {
      id: input.orderId,
      status: {
        in: [OrderStatus.pending, OrderStatus.scheduled, OrderStatus.in_progress],
      },
      ...(input.customerId ? { customerId: input.customerId } : {}),
    };
    const res = await client.order.updateMany({
      where,
      data: {
        status: OrderStatus.cancelled,
        cancelledBy: input.cancelledBy,
        cancellationReason: input.cancellationReason ?? null,
        cancelledAt: new Date(),
      },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: input.orderId } });
  }

  static async markInProgress(
    orderId: string,
    supplierId: string,
    finalPrice: number,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.order.updateMany({
      where: { id: orderId, status: OrderStatus.pending },
      data: {
        status: OrderStatus.in_progress,
        supplierId,
        finalPrice: new Prisma.Decimal(finalPrice),
      },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: orderId } });
  }

  static async markCompleted(orderId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.order.updateMany({
      where: { id: orderId, status: OrderStatus.in_progress },
      data: { status: OrderStatus.completed, completedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: orderId } });
  }

  static findCustomerOrders(customerId: string, page = 1, limit = 20) {
    return prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  static countCustomerOrders(customerId: string) {
    return prisma.order.count({ where: { customerId } });
  }

  static async resetToPending(orderId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.order.updateMany({
      where: {
        id: orderId,
        status: { in: [OrderStatus.in_progress, OrderStatus.scheduled] },
      },
      data: {
        status: OrderStatus.pending,
        supplierId: null,
        finalPrice: null,
        scheduledAt: null,
        estimatedDuration: null,
      },
    });
    if (res.count === 0) return null;
    return client.order.findUnique({ where: { id: orderId } });
  }

  static findPendingOrdersForSupplierFeed(input: {
    categoryId: string;
    governmentIds: string[];
    excludeCustomerId?: string;
  }) {
    return prisma.order.findMany({
      where: {
        categoryId: input.categoryId,
        governmentId: { in: input.governmentIds },
        status: OrderStatus.pending,
        ...(input.excludeCustomerId
          ? { NOT: { customerId: input.excludeCustomerId } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
