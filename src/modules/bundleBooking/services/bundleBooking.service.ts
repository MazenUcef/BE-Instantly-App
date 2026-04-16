import prisma from "../../../shared/config/prisma";
import {
  Prisma,
  BundleBookingStatus,
  OrderStatus,
  SessionStatus,
} from "@prisma/client";
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

type Tx = Prisma.TransactionClient;

const BUNDLE_ACTIVE_ENUM = BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES.map(
  (s) => s as BundleBookingStatus,
);

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profilePicture: true,
  address: true,
  averageRating: true,
  totalReviews: true,
} as const;

const buildBundleBookingPayload = async (bookingId: string) => {
  const booking = await prisma.bundleBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return null;

  const [bundle, supplier, customer] = await Promise.all([
    prisma.bundle.findUnique({ where: { id: booking.bundleId } }),
    prisma.user.findUnique({ where: { id: booking.supplierId }, select: userSelect }),
    prisma.user.findUnique({ where: { id: booking.customerId }, select: userSelect }),
  ]);

  return { ...booking, bundle, supplier, customer };
};

export class BundleBookingService {
  private static async ensureSlotAvailable(input: {
    supplierId: string;
    customerId?: string;
    bookedDate: string;
    slotStart: string;
    slotEnd: string;
    excludeBookingId?: string;
    tx?: Tx;
  }) {
    const client = input.tx ?? prisma;

    const existing = await BundleBookingRepository.findOverlappingSupplierBookings({
      supplierId: input.supplierId,
      bookedDate: input.bookedDate,
      statuses: BUNDLE_ACTIVE_ENUM,
    });

    for (const booking of existing) {
      if (input.excludeBookingId && booking.id === input.excludeBookingId) continue;
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

    const dayStart = new Date(input.bookedDate + "T00:00:00.000Z");
    const dayEnd = new Date(input.bookedDate + "T23:59:59.999Z");

    const supplierOrders = await client.order.findMany({
      where: {
        supplierId: input.supplierId,
        status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
        scheduledAt: { gte: dayStart, lte: dayEnd },
        estimatedDuration: { not: null },
      },
    });

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

    if (input.customerId) {
      const customerBookings = await BundleBookingRepository.findOverlappingCustomerBookings(
        {
          customerId: input.customerId,
          bookedDate: input.bookedDate,
          statuses: BUNDLE_ACTIVE_ENUM,
        },
      );

      for (const booking of customerBookings) {
        if (input.excludeBookingId && booking.id === input.excludeBookingId) continue;
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

      const customerOrders = await client.order.findMany({
        where: {
          customerId: input.customerId,
          status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
          scheduledAt: { gte: dayStart, lte: dayEnd },
          estimatedDuration: { not: null },
        },
      });

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
    if (!booking) throw new AppError("Booking not found", 404);

    const isCustomer = booking.customerId === userId;
    const isSupplier = booking.supplierId === userId;
    if (!isCustomer && !isSupplier) throw new AppError("Not allowed", 403);

    return { booking, isCustomer, isSupplier };
  }

  private static async guardSessionManaged(bookingId: string) {
    const session = await prisma.jobSession.findFirst({
      where: {
        bundleBookingId: bookingId,
        status: { notIn: [SessionStatus.completed, SessionStatus.cancelled] },
      },
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
    tx: Tx,
  ): Promise<string[]> {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      include: { workflows: true },
    });
    if (!category) throw new AppError("Category not found", 404);
    const workflow = category.workflows.find((w) => w.key === selectedWorkflow);
    if (!workflow) {
      throw new AppError("Workflow not found for this booking's category", 400);
    }
    return workflow.steps;
  }

  private static async handlePostAccept(booking: any, tx: Tx) {
    const scheduledAt = new Date(booking.scheduledAt);
    const isScheduled = scheduledAt > new Date();

    if (isScheduled) {
      return { sessionDoc: null, isScheduled: true };
    }

    if (!booking.selectedWorkflow) {
      throw new AppError("Booking has no selectedWorkflow, cannot start session", 400);
    }

    const workflowSteps = await this.resolveWorkflowSteps(
      booking.categoryId,
      booking.selectedWorkflow,
      tx,
    );

    const sessionDoc = await SessionRepository.createSession(
      {
        bundleBookingId: booking.id,
        customerId: booking.customerId,
        supplierId: booking.supplierId,
        workflowSteps,
        status: SESSION_STATUS.STARTED,
        startedAt: new Date(),
      },
      tx,
    );

    await BundleBookingRepository.updateBooking(
      booking.id,
      { status: BundleBookingStatus.in_progress },
      tx,
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

    const bundle = await prisma.bundle.findUnique({ where: { id: bundleId } });
    if (!bundle || !bundle.isActive) {
      throw new AppError("Bundle not found or inactive", 404);
    }
    if (bundle.supplierId === customerId) {
      throw new AppError("You cannot book your own bundle", 400);
    }

    const createdBooking = await prisma.$transaction(async (tx) => {
      const slotAvailable = await this.ensureSlotAvailable({
        supplierId: bundle.supplierId,
        customerId,
        bookedDate,
        slotStart,
        slotEnd,
        tx,
      });
      if (!slotAvailable) {
        throw new AppError("This slot is no longer available", 409);
      }

      return BundleBookingRepository.createBooking(
        {
          bundleId: bundle.id,
          supplierId: bundle.supplierId,
          customerId,
          categoryId: bundle.categoryId,
          governmentId,
          address: address.trim(),
          notes: notes?.trim() || null,
          bookedDate,
          slotStart,
          slotEnd,
          scheduledAt,
          selectedWorkflow: bundle.selectedWorkflow || null,
          status: BundleBookingStatus.pending_supplier_approval,
          paymentConfirmed: false,
          finalPrice: Number(bundle.price),
        },
        tx,
      );
    });

    const payload = await buildBundleBookingPayload(createdBooking.id);
    BundleBookingEventService.emitCreatedToSupplier(payload);
    await BundleBookingEventService.notifyCreated(payload, bundle.title);

    return {
      success: true,
      message: "Bundle booking created successfully",
      data: payload,
    };
  }

  static async getSupplierBookings(input: { supplierId: string; status?: string }) {
    const bookings = await BundleBookingRepository.findSupplierBookings(
      input.supplierId,
      input.status as BundleBookingStatus | undefined,
    );

    const enriched = await Promise.all(
      bookings.map((item) => buildBundleBookingPayload(item.id)),
    );

    const validBookings = enriched.filter(Boolean);
    return {
      success: true,
      data: validBookings,
      meta: { count: validBookings.length },
    };
  }

  static async getCustomerBookings(input: { customerId: string; status?: string }) {
    const bookings = await BundleBookingRepository.findCustomerBookings(
      input.customerId,
      input.status as BundleBookingStatus | undefined,
    );

    const enriched = await Promise.all(
      bookings.map((item) => buildBundleBookingPayload(item.id)),
    );

    const validBookings = enriched.filter(Boolean);
    return {
      success: true,
      data: validBookings,
      meta: { count: validBookings.length },
    };
  }

  static async getBookingById(input: { bookingId: string; userId: string }) {
    await this.getBookingForActor(input.bookingId, input.userId);
    const booking = await buildBundleBookingPayload(input.bookingId);
    if (!booking) throw new AppError("Booking not found", 404);
    return { success: true, data: booking };
  }

  static async acceptBundleBooking(input: { bookingId: string; supplierId: string }) {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await BundleBookingRepository.findSupplierBookingByStatus(
        input.bookingId,
        input.supplierId,
        BundleBookingStatus.pending_supplier_approval,
        tx,
      );
      if (!booking) throw new AppError("Pending booking not found", 404);

      const slotAvailable = await this.ensureSlotAvailable({
        supplierId: input.supplierId,
        customerId: booking.customerId,
        bookedDate: booking.bookedDate,
        slotStart: booking.slotStart,
        slotEnd: booking.slotEnd,
        excludeBookingId: booking.id,
        tx,
      });
      if (!slotAvailable) {
        throw new AppError("Booking slot is no longer available", 409);
      }

      const updated = await BundleBookingRepository.updateBooking(
        booking.id,
        {
          status: BundleBookingStatus.accepted,
          proposedBookedDate: null,
          proposedSlotStart: null,
          proposedSlotEnd: null,
          proposedScheduledAt: null,
        },
        tx,
      );

      const sessionResult = await this.handlePostAccept(updated, tx);
      return { updatedBooking: updated, sessionResult };
    });

    const { updatedBooking, sessionResult } = result;
    const payload = await buildBundleBookingPayload(updatedBooking.id);

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
      sessionId: sessionResult?.sessionDoc?.id || null,
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
      BundleBookingStatus.pending_supplier_approval,
    );
    if (!booking) throw new AppError("Pending booking not found", 404);

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      status: BundleBookingStatus.rejected,
      rejectionReason: input.rejectionReason?.trim() || null,
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);

    BundleBookingEventService.emitRejected(payload);
    await BundleBookingEventService.notifyRejected(payload);

    return {
      success: true,
      message: "Booking rejected successfully",
      data: payload,
    };
  }

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
    if (isSupplier && booking.status !== BundleBookingStatus.pending_supplier_approval) {
      throw new AppError("It's not your turn to propose a time", 400);
    }
    if (isCustomer && booking.status !== BundleBookingStatus.pending_customer_approval) {
      throw new AppError("It's not your turn to propose a time", 400);
    }

    const slotAvailable = await this.ensureSlotAvailable({
      supplierId: booking.supplierId,
      customerId: booking.customerId,
      bookedDate: proposedBookedDate,
      slotStart: proposedSlotStart,
      slotEnd: proposedSlotEnd,
      excludeBookingId: booking.id,
    });
    if (!slotAvailable) {
      throw new AppError("Proposed time slot is not available", 409);
    }

    const nextStatus = isSupplier
      ? BundleBookingStatus.pending_customer_approval
      : BundleBookingStatus.pending_supplier_approval;

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      status: nextStatus,
      proposedBookedDate,
      proposedSlotStart,
      proposedSlotEnd,
      proposedScheduledAt: new Date(proposedScheduledAt),
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);

    const proposedBy = isSupplier ? "supplier" : "customer";
    BundleBookingEventService.emitTimeProposed(payload, proposedBy);
    await BundleBookingEventService.notifyTimeProposed(payload, proposedBy);

    return {
      success: true,
      message: "Time proposal sent successfully",
      data: payload,
    };
  }

  static async acceptProposal(input: { bookingId: string; userId: string }) {
    const { booking, isCustomer, isSupplier } = await this.getBookingForActor(
      input.bookingId,
      input.userId,
    );

    if (!isNegotiationStatus(booking.status)) {
      throw new AppError("No pending proposal to accept", 400);
    }
    if (isSupplier && booking.status !== BundleBookingStatus.pending_supplier_approval) {
      throw new AppError("No pending proposal for you to accept", 400);
    }
    if (isCustomer && booking.status !== BundleBookingStatus.pending_customer_approval) {
      throw new AppError("No pending proposal for you to accept", 400);
    }

    const hasProposal =
      booking.proposedBookedDate &&
      booking.proposedSlotStart &&
      booking.proposedSlotEnd &&
      booking.proposedScheduledAt;

    const finalDate = hasProposal ? booking.proposedBookedDate! : booking.bookedDate;
    const finalSlotStart = hasProposal ? booking.proposedSlotStart! : booking.slotStart;
    const finalSlotEnd = hasProposal ? booking.proposedSlotEnd! : booking.slotEnd;
    const finalScheduledAt = hasProposal
      ? booking.proposedScheduledAt!
      : booking.scheduledAt;

    const result = await prisma.$transaction(async (tx) => {
      const slotAvailable = await this.ensureSlotAvailable({
        supplierId: booking.supplierId,
        customerId: booking.customerId,
        bookedDate: finalDate,
        slotStart: finalSlotStart,
        slotEnd: finalSlotEnd,
        excludeBookingId: booking.id,
        tx,
      });
      if (!slotAvailable) {
        throw new AppError("The time slot is no longer available", 409);
      }

      const updated = await BundleBookingRepository.updateBooking(
        booking.id,
        {
          bookedDate: finalDate,
          slotStart: finalSlotStart,
          slotEnd: finalSlotEnd,
          scheduledAt: finalScheduledAt,
          status: BundleBookingStatus.accepted,
          proposedBookedDate: null,
          proposedSlotStart: null,
          proposedSlotEnd: null,
          proposedScheduledAt: null,
        },
        tx,
      );

      const sessionResult = await this.handlePostAccept(updated, tx);
      return { updatedBooking: updated, sessionResult };
    });

    const { updatedBooking, sessionResult } = result;
    const payload = await buildBundleBookingPayload(updatedBooking.id);

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
      sessionId: sessionResult?.sessionDoc?.id || null,
      isScheduled: sessionResult?.isScheduled ?? false,
    };
  }

  static async startBundleBooking(input: { bookingId: string; supplierId: string }) {
    await this.guardSessionManaged(input.bookingId);

    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BundleBookingStatus.accepted,
    );
    if (!booking) throw new AppError("Accepted booking not found", 404);

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      status: BundleBookingStatus.in_progress,
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);
    BundleBookingEventService.emitUpdated(payload);

    return { success: true, message: "Booking started successfully", data: payload };
  }

  static async markBundleBookingDone(input: {
    bookingId: string;
    supplierId: string;
  }) {
    await this.guardSessionManaged(input.bookingId);

    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BundleBookingStatus.in_progress,
    );
    if (!booking) throw new AppError("In-progress booking not found", 404);

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      status: BundleBookingStatus.done,
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);

    BundleBookingEventService.emitUpdated(payload);
    await BundleBookingEventService.notifyDone(payload);

    return { success: true, message: "Booking marked as done", data: payload };
  }

  static async confirmBundlePayment(input: {
    bookingId: string;
    supplierId: string;
  }) {
    await this.guardSessionManaged(input.bookingId);

    const booking = await BundleBookingRepository.findSupplierBookingByStatus(
      input.bookingId,
      input.supplierId,
      BundleBookingStatus.done,
    );
    if (!booking) throw new AppError("Done booking not found", 404);

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      paymentConfirmed: true,
      paymentConfirmedAt: new Date(),
      status: BundleBookingStatus.completed,
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);

    BundleBookingEventService.emitUpdated(payload);
    await BundleBookingEventService.notifyCompleted(payload);

    return {
      success: true,
      message: "Payment confirmed and booking completed",
      data: payload,
    };
  }

  static async cancelBundleBooking(input: { bookingId: string; userId: string }) {
    const { booking, isCustomer } = await this.getBookingForActor(
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

    const updatedBooking = await BundleBookingRepository.updateBooking(booking.id, {
      status: BundleBookingStatus.cancelled,
      cancelledBy: cancelledBy as any,
      proposedBookedDate: null,
      proposedSlotStart: null,
      proposedSlotEnd: null,
      proposedScheduledAt: null,
    });

    const payload = await buildBundleBookingPayload(updatedBooking.id);

    BundleBookingEventService.emitCancelled(payload);
    await BundleBookingEventService.notifyCancelled(payload, cancelledBy);

    return {
      success: true,
      message: "Booking cancelled successfully",
      data: payload,
    };
  }
}
