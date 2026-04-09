import { ClientSession, Types } from "mongoose";
import BundleBookingModel from "../models/bundleBooking.model";

export class BundleBookingRepository {
  static createBooking(
    data: {
      bundleId: Types.ObjectId | string;
      supplierId: Types.ObjectId | string;
      customerId: Types.ObjectId | string;
      categoryId: Types.ObjectId | string;
      governmentId: Types.ObjectId | string;
      address: string;
      notes?: string | null;
      bookedDate: string;
      slotStart: string;
      slotEnd: string;
      scheduledAt: Date | string;
      status?: string;
      paymentConfirmed?: boolean;
      selectedWorkflow?: string | null;
      finalPrice: number;
      rejectionReason?: string | null;
    },
    session?: ClientSession,
  ) {
    return BundleBookingModel.create([data], { session }).then(
      (docs) => docs[0],
    );
  }

  static findById(bookingId: Types.ObjectId | string, session?: ClientSession) {
    return BundleBookingModel.findById(bookingId).session(session || null);
  }

  static findSupplierBookingByStatus(
    bookingId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    status: string,
    session?: ClientSession,
  ) {
    return BundleBookingModel.findOne({
      _id: bookingId,
      supplierId,
      status,
    }).session(session || null);
  }

  static findCustomerBookings(
    customerId: Types.ObjectId | string,
    status?: string,
  ) {
    const filter: any = { customerId };
    if (status) filter.status = status;

    return BundleBookingModel.find(filter).sort({
      scheduledAt: 1,
      createdAt: -1,
    });
  }

  static findSupplierBookings(
    supplierId: Types.ObjectId | string,
    status?: string,
  ) {
    const filter: any = { supplierId };
    if (status) filter.status = status;

    return BundleBookingModel.find(filter).sort({
      scheduledAt: 1,
      createdAt: -1,
    });
  }

  static findOverlappingSupplierBookings(input: {
    supplierId: Types.ObjectId | string;
    bookedDate: string;
    statuses: readonly string[];
  }) {
    return BundleBookingModel.find({
      supplierId: input.supplierId,
      bookedDate: input.bookedDate,
      status: { $in: [...input.statuses] },
    });
  }

  static findOverlappingCustomerBookings(input: {
    customerId: Types.ObjectId | string;
    bookedDate: string;
    statuses: readonly string[];
  }) {
    return BundleBookingModel.find({
      customerId: input.customerId,
      bookedDate: input.bookedDate,
      status: { $in: [...input.statuses] },
    });
  }

  static findDueAcceptedBookings(session?: ClientSession) {
    return BundleBookingModel.find({
      status: "accepted",
      scheduledAt: { $lte: new Date() },
      selectedWorkflow: { $ne: null },
    }).session(session || null);
  }

  static markInProgress(
    bookingId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return BundleBookingModel.findOneAndUpdate(
      { _id: bookingId, status: "accepted" },
      { $set: { status: "in_progress" } },
      { new: true, session },
    );
  }

  static updateBooking(
    bookingId: Types.ObjectId | string,
    update: Record<string, any>,
    session?: ClientSession,
  ) {
    return BundleBookingModel.findByIdAndUpdate(
      bookingId,
      { $set: update },
      { new: true, session },
    );
  }
}
