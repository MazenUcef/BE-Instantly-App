import mongoose, { Schema, Document, Types } from "mongoose";
import { AVAILABILITY_ALLOWED_SLOT_DURATIONS, DEFAULT_AVAILABILITY_TIMEZONE, DEFAULT_SLOT_DURATION_MINUTES, DEFAULT_WEEKLY_SCHEDULE } from "../../../shared/constants/availability.constants";

export interface IWeeklyScheduleItem {
  dayOfWeek: number;
  isWorking: boolean;
  startTime?: string | null;
  endTime?: string | null;
  slotDurationMinutes: number;
  breakStart?: string | null;
  breakEnd?: string | null;
}

export interface IBlockedDate {
  _id?: Types.ObjectId;
  date: Date;
  reason?: string | null;
  isFullDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ISupplierAvailability extends Document {
  supplierId: Types.ObjectId;
  timezone: string;
  weeklySchedule: IWeeklyScheduleItem[];
  blockedDates: IBlockedDate[];
  createdAt: Date;
  updatedAt: Date;
}

const WeeklyScheduleSchema = new Schema<IWeeklyScheduleItem>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    isWorking: {
      type: Boolean,
      default: false,
    },
    startTime: {
      type: String,
      default: null,
      trim: true,
    },
    endTime: {
      type: String,
      default: null,
      trim: true,
    },
    slotDurationMinutes: {
      type: Number,
      default: DEFAULT_SLOT_DURATION_MINUTES,
      enum: AVAILABILITY_ALLOWED_SLOT_DURATIONS,
    },
    breakStart: {
      type: String,
      default: null,
      trim: true,
    },
    breakEnd: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false },
);

const BlockedDateSchema = new Schema<IBlockedDate>(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    isFullDay: {
      type: Boolean,
      default: true,
    },
    startTime: {
      type: String,
      default: null,
      trim: true,
    },
    endTime: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: true },
);

const SupplierAvailabilitySchema = new Schema<ISupplierAvailability>(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    timezone: {
      type: String,
      default: DEFAULT_AVAILABILITY_TIMEZONE,
      trim: true,
    },
    weeklySchedule: {
      type: [WeeklyScheduleSchema],
      default: () => [...DEFAULT_WEEKLY_SCHEDULE],
      validate: {
        validator(value: IWeeklyScheduleItem[]) {
          const days = value.map((item) => item.dayOfWeek).sort((a, b) => a - b);
          return days.length === 7 && days.every((day, index) => day === index);
        },
        message: "weeklySchedule must contain exactly 7 unique days from 0 to 6",
      },
    },
    blockedDates: {
      type: [BlockedDateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

SupplierAvailabilitySchema.index({ supplierId: 1 });
SupplierAvailabilitySchema.index({ "blockedDates.date": 1 });
SupplierAvailabilitySchema.index({ supplierId: 1, updatedAt: -1 });

export default mongoose.model<ISupplierAvailability>(
  "SupplierAvailability",
  SupplierAvailabilitySchema,
);