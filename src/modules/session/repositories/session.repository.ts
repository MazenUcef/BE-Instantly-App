import { ClientSession, Types } from "mongoose";
import SessionModel from "../models/session.model";
import { SESSION_STATUS } from "../../../shared/constants/session.constants";

export class SessionRepository {
  static createSession(
    data: {
      orderId: Types.ObjectId | string;
      offerId: Types.ObjectId | string;
      customerId: Types.ObjectId | string;
      supplierId: Types.ObjectId | string;
      status?: string;
      startedAt?: Date;
    },
    session?: ClientSession,
  ) {
    return SessionModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(sessionId: Types.ObjectId | string, session?: ClientSession) {
    return SessionModel.findById(sessionId).session(session || null);
  }

  static findByOrderId(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SessionModel.findOne({ orderId }).session(session || null);
  }

  static findByOfferId(
    offerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SessionModel.findOne({ offerId }).session(session || null);
  }

  static findActiveByUser(
    userId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SessionModel.findOne({
      $or: [{ customerId: userId }, { supplierId: userId }],
      status: {
        $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
      },
    }).session(session || null);
  }

  static findLatestByUser(userId: Types.ObjectId | string) {
    return SessionModel.findOne({
      $or: [{ customerId: userId }, { supplierId: userId }],
    }).sort({ updatedAt: -1 });
  }

  static updateStatus(
    sessionId: Types.ObjectId | string,
    currentStatus: string,
    nextStatus: string,
    extraSet: Record<string, any> = {},
    session?: ClientSession,
  ) {
    return SessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: currentStatus,
      },
      {
        $set: {
          status: nextStatus,
          ...extraSet,
        },
      },
      { new: true, session },
    );
  }

  static markCompleted(
    sessionId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: SESSION_STATUS.WORK_STARTED,
      },
      {
        $set: {
          status: SESSION_STATUS.COMPLETED,
          completedAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static markCancelled(
    sessionId: Types.ObjectId | string,
    currentStatus: string,
    cancelledBy: "customer" | "supplier",
    cancellationReason?: string,
    session?: ClientSession,
  ) {
    return SessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: currentStatus,
      },
      {
        $set: {
          status: SESSION_STATUS.CANCELLED,
          cancelledBy,
          cancellationReason: cancellationReason || null,
          cancelledAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static confirmPayment(
    sessionId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: SESSION_STATUS.COMPLETED,
        paymentConfirmed: false,
      },
      {
        $set: {
          paymentConfirmed: true,
          paymentConfirmedAt: new Date(),
        },
      },
      { new: true, session },
    );
  }
}
