import mongoose, { Schema, Document, Types } from "mongoose";

export interface IJobSession extends Document {
  orderId: Types.ObjectId;
  offerId: Types.ObjectId;
  customerId: Types.ObjectId;
  supplierId: Types.ObjectId;

  status:
    | "accepted"
    | "on_the_way"
    | "arrived"
    | "work_started"
    | "completed"
    | "cancelled"
    | "done";

  startedAt?: Date;
  arrivedAt?: Date;
  workStartedAt?: Date;
  completedAt?: Date;
}

const JobSessionSchema = new Schema<IJobSession>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    offerId: { type: Schema.Types.ObjectId, required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: [
        "accepted",
        "on_the_way",
        "arrived",
        "work_started",
        "completed",
        "cancelled",
        "done",
      ],
      default: "accepted",
    },
  },
  { timestamps: true },
);

export default mongoose.model<IJobSession>("JobSession", JobSessionSchema);
