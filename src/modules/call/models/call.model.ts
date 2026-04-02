import mongoose, { Schema, Document, Types } from "mongoose";
import { CALL_END_REASON, CALL_STATUS, CALL_TYPE } from "../../../shared/constants/call.constants";


export interface ICallSession extends Document {
  sessionId: Types.ObjectId;
  callerId: Types.ObjectId;
  receiverId: Types.ObjectId;
  type: "audio";
  status:
    | "initiated"
    | "ringing"
    | "accepted"
    | "declined"
    | "missed"
    | "ended"
    | "failed";
  startedAt?: Date | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  endReason?:
    | "caller_ended"
    | "receiver_ended"
    | "missed"
    | "declined"
    | "failed"
    | "busy"
    | null;
  createdAt: Date;
  updatedAt: Date;
}

const CallSessionSchema = new Schema<ICallSession>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "JobSession",
      required: true,
      index: true,
    },
    callerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(CALL_TYPE),
      default: CALL_TYPE.AUDIO,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CALL_STATUS),
      default: CALL_STATUS.INITIATED,
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endReason: {
      type: String,
      enum: [...Object.values(CALL_END_REASON), null],
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

CallSessionSchema.index({ sessionId: 1, status: 1 });
CallSessionSchema.index({ callerId: 1, createdAt: -1 });
CallSessionSchema.index({ receiverId: 1, createdAt: -1 });
CallSessionSchema.index({ sessionId: 1, createdAt: -1 });

// Optional stronger protection: only one active call per session
CallSessionSchema.index(
  { sessionId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["initiated", "ringing", "accepted"] },
    },
    name: "uniq_active_call_per_session",
  },
);

export default mongoose.model<ICallSession>("CallSession", CallSessionSchema);