import { ClientSession, Types } from "mongoose";
import categoryModel from "../models/category.model";

export class CategoryRepository {
  static findActive(session?: ClientSession) {
    return categoryModel.find({ isActive: true })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findAll(session?: ClientSession) {
    return categoryModel.find()
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findById(categoryId: string | Types.ObjectId, session?: ClientSession) {
    return categoryModel.findById(categoryId).session(session || null);
  }

  static findByNormalizedName(
    normalizedName: string,
    session?: ClientSession,
  ) {
    return categoryModel.findOne({ normalizedName }).session(session || null);
  }

  static create(
    data: {
      name: string;
      normalizedName: string;
      description?: string | null;
      image?: string | null;
      jobs: string[];
      isActive?: boolean;
    },
    session?: ClientSession,
  ) {
    return categoryModel.create([data], { session }).then((docs) => docs[0]);
  }

  static updateById(
    categoryId: string | Types.ObjectId,
    updates: object,
    session?: ClientSession,
  ) {
    return categoryModel.findByIdAndUpdate(categoryId, updates, {
      new: true,
      runValidators: true,
      session,
    });
  }
}