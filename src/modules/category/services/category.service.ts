import mongoose from "mongoose";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { CategoryRepository } from "../repositories/category.repository";
import { uploadToCloudinary } from "../../../shared/utils/cloudinary";
import { validateFile } from "../../../shared/utils/helpers";
import { publishToQueue } from "../../../shared/config/rabbitmq";
import { CATEGORY_QUEUE_EVENTS } from "../../../shared/constants/category.constants";

const normalizeCategoryName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeJobs = (jobs: unknown): string[] => {
  if (!Array.isArray(jobs)) return [];

  const cleaned = jobs
    .map((job) => String(job).trim())
    .filter(Boolean);

  return Array.from(new Set(cleaned));
};

export class CategoryService {
  static async createCategory(req: any) {
    const dbSession = await mongoose.startSession();

    let createdCategory: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const files = req.files as any;
        const { name, description } = req.body;
        const jobs = normalizeJobs(req.body.jobs);

        const normalizedName = normalizeCategoryName(name);

        const existingCategory = await CategoryRepository.findByNormalizedName(
          normalizedName,
          dbSession,
        );

        if (existingCategory) {
          throw new AppError("Category already exists", 409);
        }

        let imageUrl: string | null = null;

        if (files?.image?.[0]) {
          validateFile(files.image[0]);
          const upload = await uploadToCloudinary(files.image[0]);
          imageUrl = upload.secure_url;
        } else if (req.body.image) {
          imageUrl = req.body.image;
        } else {
          throw new AppError("Category image is required", 400);
        }

        createdCategory = await CategoryRepository.create(
          {
            name: name.trim(),
            normalizedName,
            description: description?.trim?.() || null,
            image: imageUrl,
            jobs,
            isActive: true,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await publishToQueue(CATEGORY_QUEUE_EVENTS.CREATED, {
      categoryId: createdCategory._id.toString(),
      name: createdCategory.name,
      description: createdCategory.description,
      image: createdCategory.image,
      jobs: createdCategory.jobs,
    });

    return {
      success: true,
      message: "Category created successfully",
      data: createdCategory,
    };
  }

  static async getAllCategories(includeInactive = false) {
    const categories = includeInactive
      ? await CategoryRepository.findAll()
      : await CategoryRepository.findActive();

    return {
      success: true,
      count: categories.length,
      data: categories,
    };
  }

  static async getCategoryById(categoryId: string) {
    const category = await CategoryRepository.findById(categoryId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    return {
      success: true,
      data: category,
    };
  }

  static async updateCategory(req: any) {
    const categoryId = req.params.id;
    const files = req.files as any;

    const dbSession = await mongoose.startSession();
    let updatedCategory: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const category = await CategoryRepository.findById(categoryId, dbSession);

        if (!category) {
          throw new AppError("Category not found", 404);
        }

        const updates: Record<string, any> = {};

        if (req.body.name !== undefined) {
          const trimmedName = req.body.name.trim();
          const normalizedName = normalizeCategoryName(trimmedName);

          if (normalizedName !== category.normalizedName) {
            const existingCategory = await CategoryRepository.findByNormalizedName(
              normalizedName,
              dbSession,
            );

            if (existingCategory && existingCategory._id.toString() !== categoryId) {
              throw new AppError("Category name already exists", 409);
            }
          }

          updates.name = trimmedName;
          updates.normalizedName = normalizedName;
        }

        if (req.body.description !== undefined) {
          updates.description = req.body.description?.trim?.() || null;
        }

        if (req.body.jobs !== undefined) {
          updates.jobs = normalizeJobs(req.body.jobs);
        }

        if (files?.image?.[0]) {
          validateFile(files.image[0]);
          const upload = await uploadToCloudinary(files.image[0]);
          updates.image = upload.secure_url;
        } else if (req.body.image !== undefined) {
          updates.image = req.body.image || null;
        }

        updatedCategory = await CategoryRepository.updateById(
          categoryId,
          updates,
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await publishToQueue(CATEGORY_QUEUE_EVENTS.UPDATED, {
      categoryId: updatedCategory._id.toString(),
      name: updatedCategory.name,
      description: updatedCategory.description,
      image: updatedCategory.image,
      jobs: updatedCategory.jobs,
      isActive: updatedCategory.isActive,
    });

    return {
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    };
  }

  static async deleteCategory(categoryId: string) {
    const category = await CategoryRepository.findById(categoryId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    if (!category.isActive) {
      throw new AppError("Category is already inactive", 400);
    }

    const updatedCategory = await CategoryRepository.updateById(categoryId, {
      isActive: false,
    });

    await publishToQueue(CATEGORY_QUEUE_EVENTS.DEACTIVATED, {
      categoryId: updatedCategory!._id.toString(),
      name: updatedCategory!.name,
      isActive: updatedCategory!.isActive,
    });

    return {
      success: true,
      message: "Category deactivated successfully",
    };
  }
}