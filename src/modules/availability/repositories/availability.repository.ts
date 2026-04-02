import { ClientSession, Types } from "mongoose";
import SupplierAvailabilityModel from "../models/availability.model";

export class AvailabilityRepository {
  static findBySupplierId(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.findOne({ supplierId }).session(session || null);
  }

  static createDefaultForSupplier(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.create([{ supplierId }], { session }).then((docs) => docs[0]);
  }

  static findOrCreateBySupplierId(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.findOneAndUpdate(
      { supplierId },
      { $setOnInsert: { supplierId } },
      { new: true, upsert: true, session },
    );
  }

  static upsertAvailability(
    supplierId: Types.ObjectId | string,
    input: {
      timezone: string;
      weeklySchedule: any[];
    },
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.findOneAndUpdate(
      { supplierId },
      {
        $set: {
          timezone: input.timezone,
          weeklySchedule: input.weeklySchedule,
        },
      },
      { new: true, upsert: true, session },
    );
  }

  static addBlockedDate(
    supplierId: Types.ObjectId | string,
    blockedDate: {
      date: Date | string;
      reason?: string | null;
      isFullDay: boolean;
      startTime?: string | null;
      endTime?: string | null;
    },
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.findOneAndUpdate(
      { supplierId },
      {
        $setOnInsert: { supplierId },
        $push: {
          blockedDates: blockedDate,
        },
      },
      { new: true, upsert: true, session },
    );
  }

  static removeBlockedDate(
    supplierId: Types.ObjectId | string,
    blockedDateId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return SupplierAvailabilityModel.findOneAndUpdate(
      { supplierId },
      {
        $pull: {
          blockedDates: { _id: blockedDateId },
        },
      },
      { new: true, session },
    );
  }
}