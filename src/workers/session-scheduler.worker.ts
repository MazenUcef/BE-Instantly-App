import cron from "node-cron";
import mongoose from "mongoose";
import { OrderRepository } from "../modules/order/repositories/order.repository";
import { OfferRepository } from "../modules/offer/repository/offer.repository";
import { SessionRepository } from "../modules/session/repositories/session.repository";
import { BundleBookingRepository } from "../modules/bundleBooking/repositories/bundleBooking.repository";
import CategoryModel from "../modules/category/models/Category.model";
import { ORDER_STATUS } from "../shared/constants/order.constants";
import { SESSION_STATUS, SESSION_NOTIFICATION_TYPES } from "../shared/constants/session.constants";
import { getIO } from "../shared/config/socket";
import { publishNotification } from "../modules/notification/notification.publisher";

async function resolveWorkflowSteps(categoryId: any, selectedWorkflow: string, dbSession: mongoose.ClientSession): Promise<string[]> {
  const category = await CategoryModel.findById(categoryId).session(dbSession);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  const workflow = category.workflows?.find((w) => w.key === selectedWorkflow);
  if (!workflow) {
    throw new Error(`Workflow "${selectedWorkflow}" not found for category ${categoryId}`);
  }
  return workflow.steps;
}

async function processDueOrder(order: any): Promise<void> {
  const dbSession = await mongoose.startSession();

  try {
    await dbSession.withTransaction(async () => {
      const acceptedOffer = await OfferRepository.findAcceptedOfferBySupplier(
        order.supplierId,
        dbSession,
      );

      if (!acceptedOffer || acceptedOffer.orderId.toString() !== order._id.toString()) {
        throw new Error(`No accepted offer found for scheduled order ${order._id}`);
      }

      const updatedOrder = await mongoose.model("Order").findOneAndUpdate(
        { _id: order._id, status: ORDER_STATUS.SCHEDULED },
        { $set: { status: ORDER_STATUS.IN_PROGRESS } },
        { new: true, session: dbSession },
      );

      if (!updatedOrder) {
        throw new Error(`Order ${order._id} status changed concurrently, skipping`);
      }

      const workflowSteps = await resolveWorkflowSteps(order.categoryId, order.selectedWorkflow, dbSession);

      await SessionRepository.createSession(
        {
          orderId: order._id,
          offerId: acceptedOffer._id,
          customerId: order.customerId,
          supplierId: order.supplierId,
          workflowSteps,
          status: SESSION_STATUS.STARTED,
          startedAt: new Date(),
        },
        dbSession,
      );
    });

    const io = getIO();
    io.to(`user_${order.customerId.toString()}`).emit("session_auto_started", {
      orderId: order._id.toString(),
      message: "Your scheduled session has started",
    });
    io.to(`user_${order.supplierId.toString()}`).emit("session_auto_started", {
      orderId: order._id.toString(),
      message: "Your scheduled session has started",
    });

    await Promise.allSettled([
      publishNotification({
        userId: order.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: { orderId: order._id.toString() },
      }),
      publishNotification({
        userId: order.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: { orderId: order._id.toString() },
      }),
    ]);

    console.log(`✅ Session scheduler: started session for order ${order._id}`);
  } catch (err: any) {
    console.error(`❌ Session scheduler: failed to start session for order ${order._id} — ${err.message}`);
  } finally {
    await dbSession.endSession();
  }
}

async function processDueBundleBooking(booking: any): Promise<void> {
  const dbSession = await mongoose.startSession();

  try {
    await dbSession.withTransaction(async () => {
      const updated = await BundleBookingRepository.markInProgress(booking._id, dbSession);
      if (!updated) {
        throw new Error(`Booking ${booking._id} status changed concurrently, skipping`);
      }

      const workflowSteps = await resolveWorkflowSteps(
        booking.categoryId,
        booking.selectedWorkflow,
        dbSession,
      );

      await SessionRepository.createSession(
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
    });

    const io = getIO();
    io.to(`user_${booking.customerId.toString()}`).emit("session_auto_started", {
      bundleBookingId: booking._id.toString(),
      message: "Your scheduled booking session has started",
    });
    io.to(`user_${booking.supplierId.toString()}`).emit("session_auto_started", {
      bundleBookingId: booking._id.toString(),
      message: "Your scheduled booking session has started",
    });

    await Promise.allSettled([
      publishNotification({
        userId: booking.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: { bundleBookingId: booking._id.toString() },
      }),
      publishNotification({
        userId: booking.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: { bundleBookingId: booking._id.toString() },
      }),
    ]);

    console.log(`✅ Session scheduler: started session for booking ${booking._id}`);
  } catch (err: any) {
    console.error(`❌ Session scheduler: failed to start session for booking ${booking._id} — ${err.message}`);
  } finally {
    await dbSession.endSession();
  }
}

async function runSchedulerTick(): Promise<void> {
  // Process due orders
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

  // Process due bundle bookings
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
  cron.schedule("*/2 * * * *", async () => {
    await runSchedulerTick();
  });

  console.log("✅ Session scheduler worker started (runs every 2 minutes)");
};
