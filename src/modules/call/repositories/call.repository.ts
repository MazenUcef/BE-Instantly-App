import { ClientSession, Types } from "mongoose";
import CallSessionModel from "../models/call.model";
import { ACTIVE_CALL_STATUSES } from "../../../shared/constants/call.constants";

export class CallRepository {
  static createCall(
    data: {
      sessionId: Types.ObjectId | string;
      callerId: Types.ObjectId | string;
      receiverId: Types.ObjectId | string;
      type?: string;
      status?: string;
      startedAt?: Date | null;
    },
    session?: ClientSession,
  ) {
    return CallSessionModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(
    callId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return CallSessionModel.findById(callId).session(session || null);
  }

  static findActiveCallBySessionId(
    sessionId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return CallSessionModel.findOne({
      sessionId,
      status: { $in: [...ACTIVE_CALL_STATUSES] },
    }).session(session || null);
  }

  static findBySessionId(
    sessionId: Types.ObjectId | string,
  ) {
    return CallSessionModel.find({ sessionId }).sort({ createdAt: -1 });
  }

  static updateCall(
    callId: Types.ObjectId | string,
    update: Record<string, any>,
    session?: ClientSession,
  ) {
    return CallSessionModel.findByIdAndUpdate(
      callId,
      { $set: update },
      { new: true, session },
    );
  }

  static acceptCall(
    callId: Types.ObjectId | string,
    receiverId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return CallSessionModel.findOneAndUpdate(
      {
        _id: callId,
        receiverId,
        status: { $in: ["initiated", "ringing"] },
      },
      {
        $set: {
          status: "accepted",
          answeredAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static declineCall(
    callId: Types.ObjectId | string,
    receiverId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return CallSessionModel.findOneAndUpdate(
      {
        _id: callId,
        receiverId,
        status: { $in: ["initiated", "ringing"] },
      },
      {
        $set: {
          status: "declined",
          endedAt: new Date(),
          endReason: "declined",
        },
      },
      { new: true, session },
    );
  }

  static markMissed(
    callId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return CallSessionModel.findOneAndUpdate(
      {
        _id: callId,
        status: { $in: ["initiated", "ringing"] },
      },
      {
        $set: {
          status: "missed",
          endedAt: new Date(),
          endReason: "missed",
        },
      },
      { new: true, session },
    );
  }
}