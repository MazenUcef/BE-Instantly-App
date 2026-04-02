import { ClientSession, Types } from "mongoose";
import BundleModel from "../models/bundle.model";

export class BundleRepository {
  static createBundle(
    data: {
      supplierId: Types.ObjectId | string;
      categoryId: Types.ObjectId | string;
      governmentIds: (Types.ObjectId | string)[];
      title: string;
      subtitle?: string | null;
      description: string;
      image?: string | null;
      price: number;
      oldPrice?: number | null;
      durationMinutes: number;
      includes?: string[];
      tags?: string[];
      isActive?: boolean;
    },
    session?: ClientSession,
  ) {
    return BundleModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(
    bundleId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return BundleModel.findById(bundleId).session(session || null);
  }

  static findByIdForSupplier(
    bundleId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return BundleModel.findOne({ _id: bundleId, supplierId }).session(session || null);
  }

  static findAllActive(filter: {
    categoryId?: Types.ObjectId | string;
    governmentId?: Types.ObjectId | string;
    supplierId?: Types.ObjectId | string;
  }) {
    const query: any = { isActive: true };

    if (filter.categoryId) query.categoryId = filter.categoryId;
    if (filter.supplierId) query.supplierId = filter.supplierId;
    if (filter.governmentId) query.governmentIds = { $in: [filter.governmentId] };

    return BundleModel.find(query).sort({ createdAt: -1 });
  }

  static findBySupplierId(
    supplierId: Types.ObjectId | string,
  ) {
    return BundleModel.find({ supplierId }).sort({ createdAt: -1 });
  }

  static updateBundle(
    bundleId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    update: Record<string, any>,
    session?: ClientSession,
  ) {
    return BundleModel.findOneAndUpdate(
      { _id: bundleId, supplierId },
      { $set: update },
      { new: true, session },
    );
  }

  static toggleBundleStatus(
    bundleId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    nextStatus: boolean,
    session?: ClientSession,
  ) {
    return BundleModel.findOneAndUpdate(
      { _id: bundleId, supplierId },
      { $set: { isActive: nextStatus } },
      { new: true, session },
    );
  }

  static deleteBundle(
    bundleId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return BundleModel.findOneAndDelete(
      { _id: bundleId, supplierId },
      { session },
    );
  }
}