import { BundleBookingStatus, Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

export class BundleBookingRepository {
  static createBooking(
    data: {
      bundleId: string;
      supplierId: string;
      customerId: string;
      categoryId: string;
      governmentId: string;
      address: string;
      notes?: string | null;
      bookedDate: string;
      slotStart: string;
      slotEnd: string;
      scheduledAt: Date | string;
      status?: BundleBookingStatus;
      paymentConfirmed?: boolean;
      selectedWorkflow?: string | null;
      finalPrice: number;
      rejectionReason?: string | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).bundleBooking.create({
      data: {
        bundleId: data.bundleId,
        supplierId: data.supplierId,
        customerId: data.customerId,
        categoryId: data.categoryId,
        governmentId: data.governmentId,
        address: data.address,
        notes: data.notes ?? null,
        bookedDate: data.bookedDate,
        slotStart: data.slotStart,
        slotEnd: data.slotEnd,
        scheduledAt: new Date(data.scheduledAt),
        status: data.status ?? BundleBookingStatus.pending_supplier_approval,
        paymentConfirmed: data.paymentConfirmed ?? false,
        selectedWorkflow: data.selectedWorkflow ?? null,
        finalPrice: new Prisma.Decimal(data.finalPrice),
        rejectionReason: data.rejectionReason ?? null,
      },
    });
  }

  static findById(bookingId: string, tx?: Tx) {
    return (tx ?? prisma).bundleBooking.findUnique({
      where: { id: bookingId },
    });
  }

  static findSupplierBookingByStatus(
    bookingId: string,
    supplierId: string,
    status: BundleBookingStatus,
    tx?: Tx,
  ) {
    return (tx ?? prisma).bundleBooking.findFirst({
      where: { id: bookingId, supplierId, status },
    });
  }

  static findCustomerBookings(customerId: string, status?: BundleBookingStatus) {
    return prisma.bundleBooking.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    });
  }

  static findSupplierBookings(supplierId: string, status?: BundleBookingStatus) {
    return prisma.bundleBooking.findMany({
      where: { supplierId, ...(status ? { status } : {}) },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    });
  }

  static findOverlappingSupplierBookings(input: {
    supplierId: string;
    bookedDate: string;
    statuses: readonly BundleBookingStatus[];
  }) {
    return prisma.bundleBooking.findMany({
      where: {
        supplierId: input.supplierId,
        bookedDate: input.bookedDate,
        status: { in: [...input.statuses] },
      },
    });
  }

  static findOverlappingCustomerBookings(input: {
    customerId: string;
    bookedDate: string;
    statuses: readonly BundleBookingStatus[];
  }) {
    return prisma.bundleBooking.findMany({
      where: {
        customerId: input.customerId,
        bookedDate: input.bookedDate,
        status: { in: [...input.statuses] },
      },
    });
  }

  static findDueAcceptedBookings(tx?: Tx) {
    return (tx ?? prisma).bundleBooking.findMany({
      where: {
        status: BundleBookingStatus.accepted,
        scheduledAt: { lte: new Date() },
        selectedWorkflow: { not: null },
      },
    });
  }

  static async markInProgress(bookingId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.bundleBooking.updateMany({
      where: { id: bookingId, status: BundleBookingStatus.accepted },
      data: { status: BundleBookingStatus.in_progress },
    });
    if (res.count === 0) return null;
    return client.bundleBooking.findUnique({ where: { id: bookingId } });
  }

  static updateBooking(
    bookingId: string,
    update: Prisma.BundleBookingUpdateInput,
    tx?: Tx,
  ) {
    return (tx ?? prisma).bundleBooking.update({
      where: { id: bookingId },
      data: update,
    });
  }
}
