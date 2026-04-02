import { ClientSession, Types } from "mongoose";
import CategoryModel from "../models/Category.model";

export class CategoryRepository {
  static findActive(session?: ClientSession) {
    return CategoryModel.find({ isActive: true })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findAll(session?: ClientSession) {
    return CategoryModel.find()
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findById(categoryId: string | Types.ObjectId, session?: ClientSession) {
    return CategoryModel.findById(categoryId).session(session || null);
  }

  static findByNormalizedName(
    normalizedName: string,
    session?: ClientSession,
  ) {
    return CategoryModel.findOne({ normalizedName }).session(session || null);
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
    return CategoryModel.create([data], { session }).then((docs) => docs[0]);
  }

  static updateById(
    categoryId: string | Types.ObjectId,
    updates: Record<string, any>,
    session?: ClientSession,
  ) {
    return CategoryModel.findByIdAndUpdate(categoryId, updates, {
      new: true,
      runValidators: true,
      session,
    });
  }
}