import mongoose from "mongoose";
import BundleBookingModel from "../models/bundleBooking.model";
import UserModel from "../../auth/models/User.model";
import bundleModel from "../../bundle/models/bundle.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { BundleBookingRepository } from "../repositories/bundleBooking.repository";
import { overlapsTimeRange } from "../../../shared/utils/calendar";
import {
  BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES,
  BUNDLE_BOOKING_CANCELLED_BY,
  BUNDLE_BOOKING_STATUS,
} from "../../../shared/constants/bundleBooking.constants";
import { BundleBookingEventService } from "./bundleBooking-events.service";
import {
  assertValidBookingTransition,
  canCancelBooking,
} from "../helpers/bundleBooking-state";

const buildBundleBookingPayload = async (bookingId: string) => {
  const booking = await BundleBookingModel.findById(bookingId).lean();
  if (!booking) return null;

  const [bundle, supplier, customer] = await Promise.all([
    bundleModel.findById(booking.bundleId).lean(),
    UserModel.findById(booking.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(booking.customerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
  ]);

  return {
    ...booking,
    bundle,
    supplier,
    customer,
  };
};

export class BundleBookingService {
  private static async ensureSlotAvailable(input: {
    supplierId: string;
    bookedDate: string;
    slotStart: string;
    slotEnd: string;
    excludeBookingId?: string;
    session?: any;
  }) {
    const existing = await BundleBookingRepository.findOverlappingSupplierBookings({
      supplierId: input.supplierId,
      bookedDate: input.bookedDate,
      statuses: BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES,
    });

    for (const booking of existing) {
      if (
        input.excludeBookingId &&
        String(booking._id) === String(input.excludeBookingId)
      ) {
        continue;
      }

      if (
        overlapsTimeRange(
          input.slotStart,
          input.slotEnd,
          booking.slotStart,
          booking.slotEnd,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  private static async getBookingForActor(bookingId: string, userId: string) {
    const booking = await BundleBookingRepository.findById(bookingId);

    if (!booking) {
      throw new AppError("Booking not found", 404);
    }

    const isCustomer = String(booking.customerId) === String(userId);
    const isSupplier = String(booking.supplierId) === String(userId);

    if (!isCustomer && !isSupplier) {
      throw new AppError("Not allowed", 403);
    }

    return { booking, isCustomer, isSupplier };
  }

  static async createBundleBooking(input: {
    customerId: string;
    bundleId: string;
    governmentId: string;
    address: string;
    notes?: string;
    bookedDate: string;
    slotStart: string;
    slotEnd: string;
    scheduledAt: string | Date;
  }) {
    const {
      customerId,
      bundleId,
      governmentId,
      address,
      notes,
      bookedDate,
      slotStart,
      slotEnd,
      scheduledAt,
    } = input;

    if (slotStart >= slotEnd) {
      throw new AppError("slotStart must be before slotEnd", 400);
    }

    const bundle = await bundleModel.findById(bundleId);

    if (!bundle || !bundle.isActive) {
      throw new AppError("Bundle not found or inactive", 404);
    }

    if (String(bundle.supplierId) === String(customerId)) {
      throw new AppError("You cannot book your own bundle", 400);
    }

    const dbSession = await mongoose.startSession();
    let createdBooking: any;

    try {
      await dbSession.withTransaction(async () => {
        const slotAvailable = await this.ensureSlotAvailable({
          supplierId: String(bundle.supplierId),
          bookedDate,
          slotStart,
          slotEnd,
          session: dbSession,
        });

        if (!slotAvailable) {
          throw new AppError("This slot is no longer available", 409);
        }

        createdBooking = await BundleBookingRepository.createBooking(
          {
            bundleId: String(bundle._id),
            supplierId: String(bundle.supplierId),
            customerId,
            categoryId: String(bundle.categoryId),
            governmentId,
            address: address.trim(),
            notes: notes?.trim() || null,
            bookedDate,
            slotStart,
            slotEnd,
            scheduledAt,
            status: BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL,
            paymentConfirmed: false,
            finalPrice: bundle.price,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundleBookingPayload(createdBooking._id.toString());

    BundleBookingEventService.emitCreatedToSupplier(payload);
    await BundleBookingEventService.notifyCreated(payload, bundle.title);

    return {
      success: true,
      message: "Bundle booking created successfully",
      data: payload,
    };
  }

  static async getSupplierBookings(input: {
    supplierId: string;
    status?: string;
  }) {
    const bookings = await BundleBookingRepository.findSupplierBookings(
      input.supplierId,
      input.status,
    );

    const enriched = await Promise.all(
      bookings.map((item) => buildBundleBookingPayload(item._id.toString())),
    );

    const validBookings = enriched.filter(Boolean);
    return {
      success: true,
      data: validBookings,
      meta: {
        count: validBookings.length,
      },
    };
  }

  static async getCustomerBookings(input: {
    customerId: string;
    status?: string;
  }) {
    const bookings = await BundleBookingRepository.findCustomerBookings(
      input.customerId,
      input.status,
    );

    const enriched = await Promise.all(
      bookings.map((item) => buildBundleBookingPayload(item._id.toString())),
    );

    const validBookings = enriched.filter(Boolean);
    return {
      success: true,
      data: validBookings,
      meta: {
        count: validBookings.length,
      },
    };
  }

  static async getBookingById(input: {
    bookingId: string;
    userId: string;
  }) {
    await this.getBookingForActor(input.bookingId, input.userId);

    const booking = await buildBundleBookingPayload(input.bookingId);

    if (!booking) {
      throw new AppError("Booking not found", 404);
    }

    return {
      success: true,
      data: booking,
    };
  }

  static async acceptBundleBooking(input: {
    bookingId: string;
    supplierId: string;
  }) {
    const dbSession = await mongoose.startSession();
    let updatedBooking: any;

    try {
      await dbSession.withTransaction(async () => {
        const booking = await BundleBookingRepository.findSupplierBookingByStatus(
          input.bookingId,
          input.supplierId,
          BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL,
          dbSession,
        );

        if (!booking) {
          throw new AppError("Pending booking not found", 404);
        }

        const slotAvailable = await this.ensureSlotAvailable({
          supplierId: input.supplierId,
          bookedDate: booking.bookedDate,
          slotStart: booking.slotStart,
          slotEnd: booking.slotEnd,
          excludeBookingId: String(booking._id),
          session: dbSession,
        });

        if (!slotAvailable) {
          throw new AppError("Booking slot is no longer available", 409);
        }

        updatedBooking = await BundleBookingRepository.updateBooking(
          String(booking._id),
          { status: BUNDLE_BOOKING_STATUS.ACCEPTED },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundleBookingPayload(updatedBooking._id.toString());

    BundleBookingEventService.emitAccepted(payload);
    await BundleBookingEventService.notifyAccepted(payload);

    return {
      success: true,
      message: "Booking accepted successfully",
      data: payload,
    };
  }

  static async rejectBundleBooking(input: {
    bookingId: string;
    supplierId: string;
    rejectionReason?: string;
  }) {
    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL,
    );

    if (!booking) {
      throw new AppError("Pending booking not found", 404);
    }

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      {
        status: BUNDLE_BOOKING_STATUS.REJECTED,
        rejectionReason: input.rejectionReason?.trim() || null,
      },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitRejected(payload);
    await BundleBookingEventService.notifyRejected(payload);

    return {
      success: true,
      message: "Booking rejected successfully",
      data: payload,
    };
  }

  static async startBundleBooking(input: {
    bookingId: string;
    supplierId: string;
  }) {
    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BUNDLE_BOOKING_STATUS.ACCEPTED,
    );

    if (!booking) {
      throw new AppError("Accepted booking not found", 404);
    }

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      { status: BUNDLE_BOOKING_STATUS.IN_PROGRESS },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitUpdated(payload);

    return {
      success: true,
      message: "Booking started successfully",
      data: payload,
    };
  }

  static async markBundleBookingDone(input: {
    bookingId: string;
    supplierId: string;
  }) {
    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BUNDLE_BOOKING_STATUS.IN_PROGRESS,
    );

    if (!booking) {
      throw new AppError("In-progress booking not found", 404);
    }

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      { status: BUNDLE_BOOKING_STATUS.DONE },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitUpdated(payload);
    await BundleBookingEventService.notifyDone(payload);

    return {
      success: true,
      message: "Booking marked as done",
      data: payload,
    };
  }

  static async confirmBundlePayment(input: {
    bookingId: string;
    supplierId: string;
  }) {
    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BUNDLE_BOOKING_STATUS.DONE,
    );

    if (!booking) {
      throw new AppError("Done booking not found", 404);
    }

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      {
        paymentConfirmed: true,
        paymentConfirmedAt: new Date(),
        status: BUNDLE_BOOKING_STATUS.COMPLETED,
      },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitUpdated(payload);
    await BundleBookingEventService.notifyCompleted(payload);

    return {
      success: true,
      message: "Payment confirmed and booking completed",
      data: payload,
    };
  }

  static async cancelBundleBooking(input: {
    bookingId: string;
    userId: string;
  }) {
    const { booking, isCustomer, isSupplier } = await this.getBookingForActor(
      input.bookingId,
      input.userId,
    );

    assertValidBookingTransition(booking.status, BUNDLE_BOOKING_STATUS.CANCELLED);

    if (!canCancelBooking(booking.status)) {
      throw new AppError("Booking cannot be cancelled now", 400);
    }

    const cancelledBy = isCustomer
      ? BUNDLE_BOOKING_CANCELLED_BY.CUSTOMER
      : BUNDLE_BOOKING_CANCELLED_BY.SUPPLIER;

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      {
        status: BUNDLE_BOOKING_STATUS.CANCELLED,
        cancelledBy,
      },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitCancelled(payload);
    await BundleBookingEventService.notifyCancelled(payload, cancelledBy);

    return {
      success: true,
      message: "Booking cancelled successfully",
      data: payload,
    };
  }
}