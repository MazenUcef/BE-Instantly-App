import { ClientSession, Types } from "mongoose";
import governmentModel from "../models/government.model";

export class GovernmentRepository {
  static findActive(session?: ClientSession) {
    return governmentModel.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .session(session || null);
  }

  static findAll(session?: ClientSession) {
    return governmentModel.find()
      .sort({ order: 1, name: 1 })
      .session(session || null);
  }

  static findById(governmentId: string | Types.ObjectId, session?: ClientSession) {
    return governmentModel.findById(governmentId).session(session || null);
  }

  static findByNormalizedNames(
    normalizedName: string,
    normalizedNameAr: string,
    session?: ClientSession,
  ) {
    return governmentModel.findOne({
      $or: [{ normalizedName }, { normalizedNameAr }],
    }).session(session || null);
  }

  static create(
    data: {
      name: string;
      nameAr: string;
      normalizedName: string;
      normalizedNameAr: string;
      country: string;
      isActive?: boolean;
      order?: number;
    },
    session?: ClientSession,
  ) {
    return governmentModel.create([data], { session }).then((docs) => docs[0]);
  }

  static updateById(
    governmentId: string | Types.ObjectId,
    updates: Record<string, any>,
    session?: ClientSession,
  ) {
    return governmentModel.findByIdAndUpdate(governmentId, updates, {
      new: true,
      runValidators: true,
      session,
    });
  }
}