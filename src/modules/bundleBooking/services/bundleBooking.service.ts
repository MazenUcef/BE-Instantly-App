import mongoose, { ClientSession } from "mongoose";
import BundleBookingModel from "../models/bundleBooking.model";
import UserModel from "../../auth/models/User.model";
import bundleModel from "../../bundle/models/bundle.model";
import CategoryModel from "../../category/models/Category.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { BundleBookingRepository } from "../repositories/bundleBooking.repository";
import { overlapsTimeRange, minutesToTime } from "../../../shared/utils/calendar";
import {
  BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES,
  BUNDLE_BOOKING_CANCELLED_BY,
  BUNDLE_BOOKING_STATUS,
} from "../../../shared/constants/bundleBooking.constants";
import { BundleBookingEventService } from "./bundleBooking-events.service";
import {
  assertValidBookingTransition,
  canCancelBooking,
  isNegotiationStatus,
} from "../helpers/bundleBooking-state";
import { SessionRepository } from "../../session/repositories/session.repository";
import { SessionEventService } from "../../session/services/session-event.service";
import { SESSION_STATUS } from "../../../shared/constants/session.constants";
import OrderModel from "../../order/models/Order.model";
import { ORDER_STATUS } from "../../../shared/constants/order.constants";

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
    customerId?: string;
    bookedDate: string;
    slotStart: string;
    slotEnd: string;
    excludeBookingId?: string;
    session?: any;
  }) {
    // Check against supplier's other bundle bookings
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

    // Check against supplier's scheduled/in-progress orders
    const dayStart = new Date(input.bookedDate + "T00:00:00.000Z");
    const dayEnd = new Date(input.bookedDate + "T23:59:59.999Z");

    const supplierOrders = await OrderModel.find({
      supplierId: input.supplierId,
      status: { $in: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
      estimatedDuration: { $ne: null },
    }).session(input.session || null);

    for (const order of supplierOrders) {
      const startDate = new Date(order.scheduledAt!);
      const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
      const endMinutes = startMinutes + (order.estimatedDuration as number);
      const orderStart = minutesToTime(startMinutes);
      const orderEnd = minutesToTime(endMinutes);

      if (overlapsTimeRange(input.slotStart, input.slotEnd, orderStart, orderEnd)) {
        return false;
      }
    }

    // Check customer conflicts if customerId provided
    if (input.customerId) {
      const customerBookings = await BundleBookingRepository.findOverlappingCustomerBookings({
        customerId: input.customerId,
        bookedDate: input.bookedDate,
        statuses: BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES,
      });

      for (const booking of customerBookings) {
        if (input.excludeBookingId && String(booking._id) === String(input.excludeBookingId)) {
          continue;
        }
        if (overlapsTimeRange(input.slotStart, input.slotEnd, booking.slotStart, booking.slotEnd)) {
          return false;
        }
      }

      const customerOrders = await OrderModel.find({
        customerId: input.customerId,
        status: { $in: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
        scheduledAt: { $gte: dayStart, $lte: dayEnd },
        estimatedDuration: { $ne: null },
      }).session(input.session || null);

      for (const order of customerOrders) {
        const startDate = new Date(order.scheduledAt!);
        const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
        const endMinutes = startMinutes + (order.estimatedDuration as number);
        const orderStart = minutesToTime(startMinutes);
        const orderEnd = minutesToTime(endMinutes);

        if (overlapsTimeRange(input.slotStart, input.slotEnd, orderStart, orderEnd)) {
          return false;
        }
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

  private static async guardSessionManaged(bookingId: string) {
    const SessionModel = (await import("../../session/models/session.model")).default;
    const session = await SessionModel.findOne({
      bundleBookingId: bookingId,
      status: { $nin: ["completed", "cancelled"] },
    });
    if (session) {
      throw new AppError(
        "This booking is managed by a session workflow. Use session endpoints instead.",
        400,
      );
    }
  }

  private static async resolveWorkflowSteps(
    categoryId: string,
    selectedWorkflow: string,
    dbSession?: ClientSession,
  ): Promise<string[]> {
    const category = await CategoryModel.findById(categoryId).session(dbSession || null);
    if (!category) throw new AppError("Category not found", 404);

    const workflow = category.workflows?.find((w) => w.key === selectedWorkflow);
    if (!workflow) throw new AppError("Workflow not found for this booking's category", 400);

    return workflow.steps;
  }

  /**
   * After a booking is accepted, check if scheduledAt is now or future.
   * - Now → create session immediately, move booking to in_progress
   * - Future → keep as accepted (session created later when time arrives)
   * Returns the session doc if created, null otherwise.
   */
  private static async handlePostAccept(
    booking: any,
    dbSession: ClientSession,
  ) {
    const scheduledAt = new Date(booking.scheduledAt);
    const isScheduled = scheduledAt > new Date();

    if (isScheduled) {
      return { sessionDoc: null, isScheduled: true };
    }

    if (!booking.selectedWorkflow) {
      throw new AppError("Booking has no selectedWorkflow, cannot start session", 400);
    }

    const workflowSteps = await this.resolveWorkflowSteps(
      String(booking.categoryId),
      booking.selectedWorkflow,
      dbSession,
    );

    const sessionDoc = await SessionRepository.createSession(
      {
        bundleBookingId: booking._id,
        customerId: booking.customerId,
        supplierId: booking.supplierId,
        workflowSteps,
        status: SESSION_STATUS.STARTED,
        startedAt: new Date(),
      },
      dbSession,
    );

    await BundleBookingRepository.updateBooking(
      String(booking._id),
      { status: BUNDLE_BOOKING_STATUS.IN_PROGRESS },
      dbSession,
    );

    return { sessionDoc, isScheduled: false };
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
          customerId,
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
            selectedWorkflow: bundle.selectedWorkflow || null,
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

  // ── Supplier accepts the customer's proposed time ──
  static async acceptBundleBooking(input: {
    bookingId: string;
    supplierId: string;
  }) {
    const dbSession = await mongoose.startSession();
    let updatedBooking: any;
    let sessionResult: { sessionDoc: any; isScheduled: boolean } = { sessionDoc: null, isScheduled: false };

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
          customerId: String(booking.customerId),
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
          {
            status: BUNDLE_BOOKING_STATUS.ACCEPTED,
            proposedBookedDate: null,
            proposedSlotStart: null,
            proposedSlotEnd: null,
            proposedScheduledAt: null,
          },
          dbSession,
        );

        sessionResult = await this.handlePostAccept(updatedBooking, dbSession);
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundleBookingPayload(updatedBooking._id.toString());

    BundleBookingEventService.emitAccepted(payload);
    await BundleBookingEventService.notifyAccepted(payload);

    if (sessionResult && !sessionResult.isScheduled && sessionResult.sessionDoc) {
      SessionEventService.emitSessionToParticipants(
        "session:created",
        sessionResult.sessionDoc,
      );
      await SessionEventService.notifySessionCreated(sessionResult.sessionDoc);
    }

    return {
      success: true,
      message: sessionResult?.isScheduled
        ? "Booking accepted and scheduled"
        : "Booking accepted and session started",
      data: payload,
      sessionId: sessionResult?.sessionDoc?._id?.toString() || null,
      isScheduled: sessionResult?.isScheduled ?? false,
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

  // ── Either party proposes a new time ──
  static async proposeTime(input: {
    bookingId: string;
    userId: string;
    proposedBookedDate: string;
    proposedSlotStart: string;
    proposedSlotEnd: string;
    proposedScheduledAt: string | Date;
  }) {
    const {
      bookingId,
      userId,
      proposedBookedDate,
      proposedSlotStart,
      proposedSlotEnd,
      proposedScheduledAt,
    } = input;

    if (proposedSlotStart >= proposedSlotEnd) {
      throw new AppError("proposedSlotStart must be before proposedSlotEnd", 400);
    }

    const { booking, isCustomer, isSupplier } = await this.getBookingForActor(
      bookingId,
      userId,
    );

    if (!isNegotiationStatus(booking.status)) {
      throw new AppError("Booking is not in a negotiation state", 400);
    }

    // Supplier can only propose when it's pending their approval
    if (isSupplier && booking.status !== BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL) {
      throw new AppError("It's not your turn to propose a time", 400);
    }

    // Customer can only propose when it's pending their approval
    if (isCustomer && booking.status !== BUNDLE_BOOKING_STATUS.PENDING_CUSTOMER_APPROVAL) {
      throw new AppError("It's not your turn to propose a time", 400);
    }

    // Verify proposed slot is available for both parties
    const slotAvailable = await this.ensureSlotAvailable({
      supplierId: String(booking.supplierId),
      customerId: String(booking.customerId),
      bookedDate: proposedBookedDate,
      slotStart: proposedSlotStart,
      slotEnd: proposedSlotEnd,
      excludeBookingId: String(booking._id),
    });

    if (!slotAvailable) {
      throw new AppError("Proposed time slot is not available", 409);
    }

    const nextStatus = isSupplier
      ? BUNDLE_BOOKING_STATUS.PENDING_CUSTOMER_APPROVAL
      : BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL;

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      {
        status: nextStatus,
        proposedBookedDate,
        proposedSlotStart,
        proposedSlotEnd,
        proposedScheduledAt: new Date(proposedScheduledAt),
      },
    );

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    const proposedBy = isSupplier ? "supplier" : "customer";
    BundleBookingEventService.emitTimeProposed(payload, proposedBy);
    await BundleBookingEventService.notifyTimeProposed(payload, proposedBy);

    return {
      success: true,
      message: "Time proposal sent successfully",
      data: payload,
    };
  }

  // ── Either party accepts the other's proposed time ──
  static async acceptProposal(input: {
    bookingId: string;
    userId: string;
  }) {
    const { booking, isCustomer, isSupplier } = await this.getBookingForActor(
      input.bookingId,
      input.userId,
    );

    if (!isNegotiationStatus(booking.status)) {
      throw new AppError("No pending proposal to accept", 400);
    }

    // Can only accept when it's your turn (the other party proposed)
    if (isSupplier && booking.status !== BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL) {
      throw new AppError("No pending proposal for you to accept", 400);
    }

    if (isCustomer && booking.status !== BUNDLE_BOOKING_STATUS.PENDING_CUSTOMER_APPROVAL) {
      throw new AppError("No pending proposal for you to accept", 400);
    }

    // If there's a proposed time, apply it; otherwise accept current time
    const hasProposal = booking.proposedBookedDate && booking.proposedSlotStart && booking.proposedSlotEnd && booking.proposedScheduledAt;

    const finalDate = hasProposal ? booking.proposedBookedDate! : booking.bookedDate;
    const finalSlotStart = hasProposal ? booking.proposedSlotStart! : booking.slotStart;
    const finalSlotEnd = hasProposal ? booking.proposedSlotEnd! : booking.slotEnd;
    const finalScheduledAt = hasProposal ? booking.proposedScheduledAt! : booking.scheduledAt;

    const dbSession = await mongoose.startSession();
    let updatedBooking: any;
    let sessionResult: { sessionDoc: any; isScheduled: boolean } = { sessionDoc: null, isScheduled: false };

    try {
      await dbSession.withTransaction(async () => {
        const slotAvailable = await this.ensureSlotAvailable({
          supplierId: String(booking.supplierId),
          customerId: String(booking.customerId),
          bookedDate: finalDate,
          slotStart: finalSlotStart,
          slotEnd: finalSlotEnd,
          excludeBookingId: String(booking._id),
          session: dbSession,
        });

        if (!slotAvailable) {
          throw new AppError("The time slot is no longer available", 409);
        }

        updatedBooking = await BundleBookingRepository.updateBooking(
          String(booking._id),
          {
            bookedDate: finalDate,
            slotStart: finalSlotStart,
            slotEnd: finalSlotEnd,
            scheduledAt: finalScheduledAt,
            status: BUNDLE_BOOKING_STATUS.ACCEPTED,
            proposedBookedDate: null,
            proposedSlotStart: null,
            proposedSlotEnd: null,
            proposedScheduledAt: null,
          },
          dbSession,
        );

        sessionResult = await this.handlePostAccept(updatedBooking, dbSession);
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundleBookingPayload(updatedBooking!._id.toString());

    BundleBookingEventService.emitAccepted(payload);
    await BundleBookingEventService.notifyAccepted(payload);

    if (sessionResult && !sessionResult.isScheduled && sessionResult.sessionDoc) {
      SessionEventService.emitSessionToParticipants(
        "session:created",
        sessionResult.sessionDoc,
      );
      await SessionEventService.notifySessionCreated(sessionResult.sessionDoc);
    }

    return {
      success: true,
      message: sessionResult?.isScheduled
        ? "Proposal accepted, booking scheduled"
        : "Proposal accepted, session started",
      data: payload,
      sessionId: sessionResult?.sessionDoc?._id?.toString() || null,
      isScheduled: sessionResult?.isScheduled ?? false,
    };
  }

  static async startBundleBooking(input: {
    bookingId: string;
    supplierId: string;
  }) {
    await this.guardSessionManaged(input.bookingId);

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
    await this.guardSessionManaged(input.bookingId);

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
    await this.guardSessionManaged(input.bookingId);

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

    if (!canCancelBooking(booking.status)) {
      throw new AppError("Booking cannot be cancelled now", 400);
    }

    assertValidBookingTransition(booking.status, BUNDLE_BOOKING_STATUS.CANCELLED);

    const cancelledBy = isCustomer
      ? BUNDLE_BOOKING_CANCELLED_BY.CUSTOMER
      : BUNDLE_BOOKING_CANCELLED_BY.SUPPLIER;

    const updatedBooking = await BundleBookingRepository.updateBooking(
      String(booking._id),
      {
        status: BUNDLE_BOOKING_STATUS.CANCELLED,
        cancelledBy,
        proposedBookedDate: null,
        proposedSlotStart: null,
        proposedSlotEnd: null,
        proposedScheduledAt: null,
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
