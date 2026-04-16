import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const withGovernments = {
  governments: { include: { government: true } },
} as const;

export class BundleRepository {
  static createBundle(
    data: {
      supplierId: string;
      categoryId: string;
      governmentIds: string[];
      title: string;
      subtitle?: string | null;
      description: string;
      image?: string | null;
      price: number;
      oldPrice?: number | null;
      durationMinutes: number;
      includes?: string[];
      tags?: string[];
      selectedWorkflow?: string | null;
      isActive?: boolean;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).bundle.create({
      data: {
        supplierId: data.supplierId,
        categoryId: data.categoryId,
        title: data.title,
        subtitle: data.subtitle ?? null,
        description: data.description,
        image: data.image ?? null,
        price: new Prisma.Decimal(data.price),
        oldPrice: data.oldPrice != null ? new Prisma.Decimal(data.oldPrice) : null,
        durationMinutes: data.durationMinutes,
        includes: data.includes ?? [],
        tags: data.tags ?? [],
        selectedWorkflow: data.selectedWorkflow ?? null,
        isActive: data.isActive ?? true,
        governments: {
          create: data.governmentIds.map((governmentId) => ({ governmentId })),
        },
      },
      include: withGovernments,
    });
  }

  static findById(bundleId: string, tx?: Tx) {
    return (tx ?? prisma).bundle.findUnique({
      where: { id: bundleId },
      include: withGovernments,
    });
  }

  static findByIdForSupplier(bundleId: string, supplierId: string, tx?: Tx) {
    return (tx ?? prisma).bundle.findFirst({
      where: { id: bundleId, supplierId },
      include: withGovernments,
    });
  }

  static findAllActive(filter: {
    categoryId?: string;
    governmentId?: string;
    supplierId?: string;
  }) {
    return prisma.bundle.findMany({
      where: {
        isActive: true,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
        ...(filter.governmentId
          ? { governments: { some: { governmentId: filter.governmentId } } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: withGovernments,
    });
  }

  static findBySupplierId(supplierId: string) {
    return prisma.bundle.findMany({
      where: { supplierId },
      orderBy: { createdAt: "desc" },
      include: withGovernments,
    });
  }

  static async updateBundle(
    bundleId: string,
    supplierId: string,
    update: {
      title?: string;
      subtitle?: string | null;
      description?: string;
      image?: string | null;
      price?: number;
      oldPrice?: number | null;
      durationMinutes?: number;
      includes?: string[];
      tags?: string[];
      selectedWorkflow?: string | null;
      isActive?: boolean;
      categoryId?: string;
      governmentIds?: string[];
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const existing = await client.bundle.findFirst({
      where: { id: bundleId, supplierId },
    });
    if (!existing) return null;

    const { governmentIds, price, oldPrice, ...rest } = update;

    if (governmentIds) {
      await client.bundleGovernment.deleteMany({ where: { bundleId } });
      await client.bundleGovernment.createMany({
        data: governmentIds.map((governmentId) => ({
          bundleId,
          governmentId,
        })),
      });
    }

    return client.bundle.update({
      where: { id: bundleId },
      data: {
        ...rest,
        ...(price != null ? { price: new Prisma.Decimal(price) } : {}),
        ...(oldPrice !== undefined
          ? { oldPrice: oldPrice != null ? new Prisma.Decimal(oldPrice) : null }
          : {}),
      },
      include: withGovernments,
    });
  }

  static async toggleBundleStatus(
    bundleId: string,
    supplierId: string,
    nextStatus: boolean,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.bundle.updateMany({
      where: { id: bundleId, supplierId },
      data: { isActive: nextStatus },
    });
    if (res.count === 0) return null;
    return client.bundle.findUnique({
      where: { id: bundleId },
      include: withGovernments,
    });
  }

  static async deleteBundle(bundleId: string, supplierId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.bundle.findFirst({
      where: { id: bundleId, supplierId },
    });
    if (!existing) return null;
    await client.bundle.delete({ where: { id: bundleId } });
    return existing;
  }
}
