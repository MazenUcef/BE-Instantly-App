import mongoose from "mongoose";
import UserModel from "../../auth/models/User.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { BundleRepository } from "../repositories/bundle.repository";
import { buildBundlePayload } from "../../../shared/utils/helpers";

export class BundleService {
  private static async getSupplierOrThrow(supplierId: string) {
    const supplier = await UserModel.findById(supplierId);

    if (!supplier || supplier.role !== "supplier") {
      throw new AppError("Only suppliers can manage bundles", 403);
    }

    return supplier;
  }

  private static normalizeStringArray(input: any): string[] {
    if (!Array.isArray(input)) return [];

    return input.map((item) => String(item).trim()).filter(Boolean);
  }

  private static async buildManyBundlePayloads(bundleIds: string[]) {
    const payloads = await Promise.all(
      bundleIds.map((id) => buildBundlePayload(id)),
    );

    return payloads.filter(Boolean);
  }

  static async createBundle(input: {
    supplierId: string;
    categoryId?: string;
    governmentIds?: string[];
    title: string;
    subtitle?: string | null;
    description: string;
    image?: string | null;
    price: number;
    oldPrice?: number | null;
    durationMinutes: number;
    includes?: string[];
    tags?: string[];
  }) {
    const {
      supplierId,
      categoryId,
      governmentIds,
      title,
      subtitle,
      description,
      image,
      price,
      oldPrice,
      durationMinutes,
      includes,
      tags,
    } = input;

    const supplier = await this.getSupplierOrThrow(supplierId);

    const resolvedCategoryId = categoryId || String(supplier.categoryId || "");
    const resolvedGovernmentIds =
      Array.isArray(governmentIds) && governmentIds.length > 0
        ? governmentIds
        : (supplier.governmentIds || []).map(String);

    if (!resolvedCategoryId) {
      throw new AppError("Supplier category is required to create bundle", 400);
    }

    if (!resolvedGovernmentIds.length) {
      throw new AppError(
        "At least one government is required to create bundle",
        400,
      );
    }

    if (oldPrice && oldPrice < price) {
      throw new AppError(
        "oldPrice must be greater than or equal to price",
        400,
      );
    }

    const dbSession = await mongoose.startSession();
    let bundle: any;

    try {
      await dbSession.withTransaction(async () => {
        bundle = await BundleRepository.createBundle(
          {
            supplierId,
            categoryId: resolvedCategoryId,
            governmentIds: resolvedGovernmentIds,
            title: title.trim(),
            subtitle: subtitle?.trim() || null,
            description: description.trim(),
            image: image?.trim() || null,
            price,
            oldPrice: oldPrice ?? null,
            durationMinutes,
            includes: this.normalizeStringArray(includes),
            tags: this.normalizeStringArray(tags),
            isActive: true,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundlePayload(bundle._id.toString());

    return {
      success: true,
      message: "Bundle created successfully",
      bundle: payload,
    };
  }

  static async getAllBundles(input: {
    categoryId?: string;
    governmentId?: string;
    supplierId?: string;
  }) {
    const bundles = await BundleRepository.findAllActive(input);

    const enriched = await this.buildManyBundlePayloads(
      bundles.map((bundle) => bundle._id.toString()),
    );

    return {
      success: true,
      count: enriched.length,
      bundles: enriched,
    };
  }

  static async getBundleById(input: { bundleId: string }) {
    const bundle = await buildBundlePayload(input.bundleId);

    if (!bundle) {
      throw new AppError("Bundle not found", 404);
    }

    return {
      success: true,
      bundle,
    };
  }

  static async getMyBundles(input: { supplierId: string }) {
    await this.getSupplierOrThrow(input.supplierId);

    const bundles = await BundleRepository.findBySupplierId(input.supplierId);

    const enriched = await this.buildManyBundlePayloads(
      bundles.map((bundle) => bundle._id.toString()),
    );

    return {
      success: true,
      count: enriched.length,
      bundles: enriched,
    };
  }

  static async updateBundle(input: {
    supplierId: string;
    bundleId: string;
    updates: Record<string, any>;
  }) {
    const { supplierId, bundleId, updates } = input;

    await this.getSupplierOrThrow(supplierId);

    const existingBundle = await BundleRepository.findByIdForSupplier(
      bundleId,
      supplierId,
    );

    if (!existingBundle) {
      throw new AppError("Bundle not found", 404);
    }

    const allowedFields = [
      "title",
      "subtitle",
      "description",
      "image",
      "price",
      "oldPrice",
      "durationMinutes",
      "categoryId",
      "governmentIds",
      "includes",
      "tags",
      "isActive",
    ];

    const safeUpdate: Record<string, any> = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdate[field] = updates[field];
      }
    }

    if (safeUpdate.title !== undefined)
      safeUpdate.title = String(safeUpdate.title).trim();
    if (safeUpdate.subtitle !== undefined)
      safeUpdate.subtitle = safeUpdate.subtitle
        ? String(safeUpdate.subtitle).trim()
        : null;
    if (safeUpdate.description !== undefined)
      safeUpdate.description = String(safeUpdate.description).trim();
    if (safeUpdate.image !== undefined)
      safeUpdate.image = safeUpdate.image
        ? String(safeUpdate.image).trim()
        : null;
    if (safeUpdate.includes !== undefined)
      safeUpdate.includes = this.normalizeStringArray(safeUpdate.includes);
    if (safeUpdate.tags !== undefined)
      safeUpdate.tags = this.normalizeStringArray(safeUpdate.tags);

    const nextPrice = safeUpdate.price ?? existingBundle.price;
    const nextOldPrice =
      safeUpdate.oldPrice !== undefined
        ? safeUpdate.oldPrice
        : existingBundle.oldPrice;

    if (nextOldPrice && nextOldPrice < nextPrice) {
      throw new AppError(
        "oldPrice must be greater than or equal to price",
        400,
      );
    }

    const dbSession = await mongoose.startSession();
    let updatedBundle: any;

    try {
      await dbSession.withTransaction(async () => {
        updatedBundle = await BundleRepository.updateBundle(
          bundleId,
          supplierId,
          safeUpdate,
          dbSession,
        );

        if (!updatedBundle) {
          throw new AppError("Bundle not found", 404);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildBundlePayload(updatedBundle._id.toString());

    return {
      success: true,
      message: "Bundle updated successfully",
      bundle: payload,
    };
  }

  static async toggleBundleStatus(input: {
    supplierId: string;
    bundleId: string;
  }) {
    const { supplierId, bundleId } = input;

    await this.getSupplierOrThrow(supplierId);

    const bundle = await BundleRepository.findByIdForSupplier(
      bundleId,
      supplierId,
    );

    if (!bundle) {
      throw new AppError("Bundle not found", 404);
    }

    const updatedBundle = await BundleRepository.toggleBundleStatus(
      bundleId,
      supplierId,
      !bundle.isActive,
    );

    if (!updatedBundle) {
      throw new AppError("Bundle not found", 404);
    }

    const payload = await buildBundlePayload(updatedBundle._id.toString());

    return {
      success: true,
      message: `Bundle ${updatedBundle.isActive ? "activated" : "deactivated"} successfully`,
      bundle: payload,
    };
  }

  static async deleteBundle(input: { supplierId: string; bundleId: string }) {
    const { supplierId, bundleId } = input;

    await this.getSupplierOrThrow(supplierId);

    const dbSession = await mongoose.startSession();
    let deletedBundle: any;

    try {
      await dbSession.withTransaction(async () => {
        deletedBundle = await BundleRepository.deleteBundle(
          bundleId,
          supplierId,
          dbSession,
        );

        if (!deletedBundle) {
          throw new AppError("Bundle not found", 404);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    return {
      success: true,
      message: "Bundle deleted successfully",
      data: {
        deletedBundleId: deletedBundle._id.toString(),
      },
    };
  }
}
