import cron from "node-cron";
import mongoose from "mongoose";
import { OrderRepository } from "../modules/order/repositories/order.repository";
import { OfferRepository } from "../modules/offer/repository/offer.repository";
import { SessionRepository } from "../modules/session/repositories/session.repository";
import { BundleBookingRepository } from "../modules/bundleBooking/repositories/bundleBooking.repository";
import CategoryModel from "../modules/category/models/Category.model";
import UserModel from "../modules/auth/models/User.model";
import OrderModel from "../modules/order/models/Order.model";
import OfferModel from "../modules/offer/models/Offer.model";
import BundleBookingModel from "../modules/bundleBooking/models/bundleBooking.model";
import BundleModel from "../modules/bundle/models/bundle.model";
import { SessionEventService } from "../modules/session/services/session-event.service";
import { ORDER_STATUS } from "../shared/constants/order.constants";
import {
  SESSION_STATUS,
  SESSION_NOTIFICATION_TYPES,
} from "../shared/constants/session.constants";
import { getIO, socketEvents } from "../shared/config/socket";
import { publishNotification } from "../modules/notification/notification.publisher";

async function resolveWorkflowSteps(
  categoryId: any,
  selectedWorkflow: string,
  dbSession: mongoose.ClientSession,
): Promise<string[]> {
  const category = await CategoryModel.findById(categoryId).session(dbSession);

  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }

  const workflow = category.workflows?.find((w) => w.key === selectedWorkflow);

  if (!workflow) {
    throw new Error(
      `Workflow "${selectedWorkflow}" not found for category ${categoryId}`,
    );
  }

  return workflow.steps;
}

async function populateScheduledOrderSession(session: any) {
  const sessionObj = session?.toObject ? session.toObject() : session;

  const [customer, supplier, order, offer] = await Promise.all([
    UserModel.findById(session.customerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(session.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    session.orderId
      ? OrderModel.findById(session.orderId)
          .populate("categoryId", "name icon")
          .populate("governmentId", "name nameAr")
          .lean()
      : null,
    session.offerId ? OfferModel.findById(session.offerId).lean() : null,
  ]);

  return {
    ...sessionObj,
    order: order || null,
    offer: offer || null,
    bundleBooking: null,
    bundle: null,
    customer: customer || null,
    supplier: supplier || null,
  };
}

async function populateScheduledBundleBookingSession(session: any) {
  const sessionObj = session?.toObject ? session.toObject() : session;

  const [customer, supplier, booking] = await Promise.all([
    UserModel.findById(session.customerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(session.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    session.bundleBookingId
      ? BundleBookingModel.findById(session.bundleBookingId)
          .populate("categoryId", "name icon")
          .populate("governmentId", "name nameAr")
          .lean()
      : null,
  ]);

  const bundle =
    booking?.bundleId ? await BundleModel.findById(booking.bundleId).lean() : null;

  return {
    ...sessionObj,
    order: null,
    offer: null,
    bundleBooking: booking || null,
    bundle: bundle || null,
    customer: customer || null,
    supplier: supplier || null,
  };
}

async function processDueOrder(order: any): Promise<void> {
  const dbSession = await mongoose.startSession();
  let createdSession: any = null;

  try {
    await dbSession.withTransaction(async () => {
      const acceptedOffer = await OfferRepository.findAcceptedOfferBySupplier(
        order.supplierId,
        dbSession,
      );

      if (
        !acceptedOffer ||
        acceptedOffer.orderId.toString() !== order._id.toString()
      ) {
        throw new Error(
          `No accepted offer found for scheduled order ${order._id}`,
        );
      }

      const updatedOrder = await mongoose
        .model("Order")
        .findOneAndUpdate(
          { _id: order._id, status: ORDER_STATUS.SCHEDULED },
          { $set: { status: ORDER_STATUS.IN_PROGRESS } },
          { new: true, session: dbSession },
        );

      if (!updatedOrder) {
        throw new Error(
          `Order ${order._id} status changed concurrently, skipping`,
        );
      }

      const workflowSteps = await resolveWorkflowSteps(
        order.categoryId,
        order.selectedWorkflow,
        dbSession,
      );

      createdSession = await SessionRepository.createSession(
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

    if (!createdSession?._id) {
      throw new Error(`Session was not created for order ${order._id}`);
    }

    const populatedSession = await populateScheduledOrderSession(createdSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_CREATED,
      populatedSession,
    );

    const io = getIO();
    io.to(`user_${order.customerId.toString()}`).emit("session_auto_started", {
      orderId: order._id.toString(),
      sessionId: createdSession._id.toString(),
      message: "Your scheduled session has started",
    });
    io.to(`user_${order.supplierId.toString()}`).emit("session_auto_started", {
      orderId: order._id.toString(),
      sessionId: createdSession._id.toString(),
      message: "Your scheduled session has started",
    });

    await Promise.allSettled([
      publishNotification({
        userId: order.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: {
          orderId: order._id.toString(),
          sessionId: createdSession._id.toString(),
        },
      }),
      publishNotification({
        userId: order.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Session Started",
        message: "Your scheduled session has automatically started.",
        data: {
          orderId: order._id.toString(),
          sessionId: createdSession._id.toString(),
        },
      }),
    ]);

    console.log(`✅ Session scheduler: started session for order ${order._id}`);
  } catch (err: any) {
    console.error(
      `❌ Session scheduler: failed to start session for order ${order._id} — ${err.message}`,
    );
  } finally {
    await dbSession.endSession();
  }
}

async function processDueBundleBooking(booking: any): Promise<void> {
  const dbSession = await mongoose.startSession();
  let createdSession: any = null;

  try {
    await dbSession.withTransaction(async () => {
      const updated = await BundleBookingRepository.markInProgress(
        booking._id,
        dbSession,
      );

      if (!updated) {
        throw new Error(
          `Booking ${booking._id} status changed concurrently, skipping`,
        );
      }

      const workflowSteps = await resolveWorkflowSteps(
        booking.categoryId,
        booking.selectedWorkflow,
        dbSession,
      );

      createdSession = await SessionRepository.createSession(
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

    if (!createdSession?._id) {
      throw new Error(`Session was not created for booking ${booking._id}`);
    }

    const populatedSession =
      await populateScheduledBundleBookingSession(createdSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_CREATED,
      populatedSession,
    );

    const io = getIO();
    io.to(`user_${booking.customerId.toString()}`).emit(
      "session_auto_started",
      {
        bundleBookingId: booking._id.toString(),
        sessionId: createdSession._id.toString(),
        message: "Your scheduled booking session has started",
      },
    );
    io.to(`user_${booking.supplierId.toString()}`).emit(
      "session_auto_started",
      {
        bundleBookingId: booking._id.toString(),
        sessionId: createdSession._id.toString(),
        message: "Your scheduled booking session has started",
      },
    );

    await Promise.allSettled([
      publishNotification({
        userId: booking.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: {
          bundleBookingId: booking._id.toString(),
          sessionId: createdSession._id.toString(),
        },
      }),
      publishNotification({
        userId: booking.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "Booking Session Started",
        message: "Your scheduled booking session has automatically started.",
        data: {
          bundleBookingId: booking._id.toString(),
          sessionId: createdSession._id.toString(),
        },
      }),
    ]);

    console.log(
      `✅ Session scheduler: started session for booking ${booking._id}`,
    );
  } catch (err: any) {
    console.error(
      `❌ Session scheduler: failed to start session for booking ${booking._id} — ${err.message}`,
    );
  } finally {
    await dbSession.endSession();
  }
}

async function runSchedulerTick(): Promise<void> {
  try {
    const dueOrders = await OrderRepository.findDueScheduledOrders();

    if (dueOrders.length > 0) {
      console.log(
        `Session scheduler: processing ${dueOrders.length} due order(s)`,
      );

      for (const order of dueOrders) {
        await processDueOrder(order);
      }
    }
  } catch (err: any) {
    console.error(
      "Session scheduler: failed to query due orders —",
      err.message,
    );
  }

  try {
    const dueBookings = await BundleBookingRepository.findDueAcceptedBookings();

    if (dueBookings.length > 0) {
      console.log(
        `Session scheduler: processing ${dueBookings.length} due booking(s)`,
      );

      for (const booking of dueBookings) {
        await processDueBundleBooking(booking);
      }
    }
  } catch (err: any) {
    console.error(
      "Session scheduler: failed to query due bookings —",
      err.message,
    );
  }
}

export const startSessionSchedulerWorker = () => {
  cron.schedule("* * * * *", async () => {
    await runSchedulerTick();
  });

  console.log("✅ Session scheduler worker started (runs every minute)");
};