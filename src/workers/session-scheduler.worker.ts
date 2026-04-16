import cron from "node-cron";
import prisma from "../shared/config/prisma";
import { Prisma, OrderStatus, SessionStatus } from "@prisma/client";
import { OrderRepository } from "../modules/order/repositories/order.repository";
import { OfferRepository } from "../modules/offer/repository/offer.repository";
import { SessionRepository } from "../modules/session/repositories/session.repository";
import { BundleBookingRepository } from "../modules/bundleBooking/repositories/bundleBooking.repository";
import { SessionEventService } from "../modules/session/services/session-event.service";
import { SESSION_NOTIFICATION_TYPES } from "../shared/constants/session.constants";
import { getIO, socketEvents } from "../shared/config/socket";
import { publishNotification } from "../modules/notification/notification.publisher";

type Tx = Prisma.TransactionClient;

async function resolveWorkflowSteps(
  categoryId: string,
  selectedWorkflow: string,
  tx: Tx,
): Promise<string[]> {
  const category = await tx.category.findUnique({
    where: { id: categoryId },
    include: { workflows: true },
  });
  if (!category) throw new Error(`Category not found: ${categoryId}`);
  const workflow = category.workflows.find((w) => w.key === selectedWorkflow);
  if (!workflow) {
    throw new Error(
      `Workflow "${selectedWorkflow}" not found for category ${categoryId}`,
    );
  }
  return workflow.steps;
}

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profilePicture: true,
  address: true,
} as const;

async function populateScheduledOrderSession(session: any) {
  const [customer, supplier, order, offer] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.customerId }, select: userSelect }),
    prisma.user.findUnique({ where: { id: session.supplierId }, select: userSelect }),
    session.orderId
      ? prisma.order.findUnique({
          where: { id: session.orderId },
          include: {
            category: { select: { id: true, name: true } },
            government: { select: { id: true, name: true, nameAr: true } },
          },
        })
      : null,
    session.offerId ? prisma.offer.findUnique({ where: { id: session.offerId } }) : null,
  ]);

  return {
    ...session,
    order: order || null,
    offer: offer || null,
    bundleBooking: null,
    bundle: null,
    customer: customer || null,
    supplier: supplier || null,
  };
}

async function populateScheduledBundleBookingSession(session: any) {
  const [customer, supplier, booking] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.customerId }, select: userSelect }),
    prisma.user.findUnique({ where: { id: session.supplierId }, select: userSelect }),
    session.bundleBookingId
      ? prisma.bundleBooking.findUnique({
          where: { id: session.bundleBookingId },
          include: {
            category: { select: { id: true, name: true } },
            government: { select: { id: true, name: true, nameAr: true } },
          },
        })
      : null,
  ]);

  const bundle = booking?.bundleId
    ? await prisma.bundle.findUnique({ where: { id: booking.bundleId } })
    : null;

  return {
    ...session,
    order: null,
    offer: null,
    bundleBooking: booking || null,
    bundle: bundle || null,
    customer: customer || null,
    supplier: supplier || null,
  };
}

async function processDueOrder(order: any): Promise<void> {
  try {
    const createdSession = await prisma.$transaction(async (tx) => {
      if (!order.supplierId) {
        throw new Error(`Order ${order.id} has no supplierId`);
      }

      const acceptedOffer = await OfferRepository.findAcceptedOfferBySupplier(
        order.supplierId,
        tx,
      );

      if (!acceptedOffer || acceptedOffer.orderId !== order.id) {
        throw new Error(`No accepted offer found for scheduled order ${order.id}`);
      }

      const res = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.scheduled },
        data: { status: OrderStatus.in_progress },
      });
      if (res.count === 0) {
        throw new Error(`Order ${order.id} status changed concurrently, skipping`);
      }

      const workflowSteps = await resolveWorkflowSteps(
        order.categoryId,
        order.selectedWorkflow,
        tx,
      );

      return SessionRepository.createSession(
        {
          orderId: order.id,
          offerId: acceptedOffer.id,
          customerId: order.customerId,
          supplierId: order.supplierId,
          workflowSteps,
          status: SessionStatus.started,
          startedAt: new Date(),
        },
        tx,
      );
    });

    if (!createdSession?.id) {
      throw new Error(`Session was not created for order ${order.id}`);
    }

    const populatedSession = await populateScheduledOrderSession(createdSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_CREATED,
      populatedSession,
    );

    const io = getIO();
    io.to(`user_${order.customerId}`).emit("session_auto_started", {
      orderId: order.id,
      sessionId: createdSession.id,
      message: "Your scheduled session has started",
    });
    io.to(`user_${order.supplierId}`).emit("session_auto_started", {
      orderId: order.id,
      sessionId: createdSession.id,
      message: "Your scheduled session has started",
    });

    await Promise.allSettled([
      publishNotification({
        userId: order.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: { orderId: order.id, sessionId: createdSession.id },
      }),
      publishNotification({
        userId: order.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: { orderId: order.id, sessionId: createdSession.id },
      }),
    ]);

    console.log(`✅ Session scheduler: started session for order ${order.id}`);
  } catch (err: any) {
    console.error(
      `❌ Session scheduler: failed to start session for order ${order.id} — ${err.message}`,
    );
  }
}

async function processDueBundleBooking(booking: any): Promise<void> {
  try {
    const createdSession = await prisma.$transaction(async (tx) => {
      const updated = await BundleBookingRepository.markInProgress(booking.id, tx);
      if (!updated) {
        throw new Error(`Booking ${booking.id} status changed concurrently, skipping`);
      }

      const workflowSteps = await resolveWorkflowSteps(
        booking.categoryId,
        booking.selectedWorkflow,
        tx,
      );

      return SessionRepository.createSession(
        {
          bundleBookingId: booking.id,
          customerId: booking.customerId,
          supplierId: booking.supplierId,
          workflowSteps,
          status: SessionStatus.started,
          startedAt: new Date(),
        },
        tx,
      );
    });

    if (!createdSession?.id) {
      throw new Error(`Session was not created for booking ${booking.id}`);
    }

    const populatedSession = await populateScheduledBundleBookingSession(createdSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_CREATED,
      populatedSession,
    );

    const io = getIO();
    io.to(`user_${booking.customerId}`).emit("session_auto_started", {
      bundleBookingId: booking.id,
      sessionId: createdSession.id,
      message: "Your scheduled booking session has started",
    });
    io.to(`user_${booking.supplierId}`).emit("session_auto_started", {
      bundleBookingId: booking.id,
      sessionId: createdSession.id,
      message: "Your scheduled booking session has started",
    });

    await Promise.allSettled([
      publishNotification({
        userId: booking.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: { bundleBookingId: booking.id, sessionId: createdSession.id },
      }),
      publishNotification({
        userId: booking.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: { bundleBookingId: booking.id, sessionId: createdSession.id },
      }),
    ]);

    console.log(`✅ Session scheduler: started session for booking ${booking.id}`);
  } catch (err: any) {
    console.error(
      `❌ Session scheduler: failed to start session for booking ${booking.id} — ${err.message}`,
    );
  }
}

async function runSchedulerTick(): Promise<void> {
  try {
    const dueOrders = await OrderRepository.findDueScheduledOrders();
    if (dueOrders.length > 0) {
      console.log(`Session scheduler: processing ${dueOrders.length} due order(s)`);
      for (const order of dueOrders) {
        await processDueOrder(order);
      }
    }
  } catch (err: any) {
    console.error("Session scheduler: failed to query due orders —", err.message);
  }

  try {
    const dueBookings = await BundleBookingRepository.findDueAcceptedBookings();
    if (dueBookings.length > 0) {
      console.log(`Session scheduler: processing ${dueBookings.length} due booking(s)`);
      for (const booking of dueBookings) {
        await processDueBundleBooking(booking);
      }
    }
  } catch (err: any) {
    console.error("Session scheduler: failed to query due bookings —", err.message);
  }
}

export const startSessionSchedulerWorker = () => {
  cron.schedule("* * * * *", async () => {
    await runSchedulerTick();
  });
  console.log("✅ Session scheduler worker started (runs every minute)");
};
