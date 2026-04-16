import prisma from "../../../shared/config/prisma";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { CategoryRepository, ISessionWorkflowDef } from "../repositories/category.repository";
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

const normalizeWorkflows = (workflows: unknown): ISessionWorkflowDef[] => {
  if (!Array.isArray(workflows)) return [];

  const normalized: ISessionWorkflowDef[] = workflows.map((w) => ({
    key: String(w.key ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
    label: String(w.label ?? "").trim(),
    steps: Array.isArray(w.steps)
      ? (Array.from(
          new Set(
            w.steps
              .map((s: any) =>
                String(s).trim().toLowerCase().replace(/\s+/g, "_"),
              )
              .filter(Boolean),
          ),
        ) as string[])
      : [],
  }));

  const keys = normalized.map((w) => w.key);
  if (new Set(keys).size !== keys.length) {
    throw new AppError("Workflow keys must be unique within a category", 400);
  }

  return normalized;
};

export class CategoryService {
  static async createCategory(req: any) {
    const files = req.files as any;
    const { name, description } = req.body;
    const jobs = normalizeJobs(req.body.jobs);
    const workflows = normalizeWorkflows(req.body.workflows);
    const normalizedName = normalizeCategoryName(name);

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

    const createdCategory = await prisma.$transaction(async (tx) => {
      const existing = await CategoryRepository.findByNormalizedName(normalizedName, tx);
      if (existing) throw new AppError("Category already exists", 409);

      return CategoryRepository.create(
        {
          name: name.trim(),
          normalizedName,
          description: description?.trim?.() || null,
          image: imageUrl,
          jobs,
          workflows,
          isActive: true,
        },
        tx,
      );
    });

    await publishToQueue(CATEGORY_QUEUE_EVENTS.CREATED, {
      categoryId: createdCategory.id,
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

    let imageUrl: string | null | undefined;
    if (files?.image?.[0]) {
      validateFile(files.image[0]);
      const upload = await uploadToCloudinary(files.image[0]);
      imageUrl = upload.secure_url;
    } else if (req.body.image !== undefined) {
      imageUrl = req.body.image || null;
    }

    const updatedCategory = await prisma.$transaction(async (tx) => {
      const category = await CategoryRepository.findById(categoryId, tx);
      if (!category) throw new AppError("Category not found", 404);

      const updates: any = {};
      if (req.body.name !== undefined) {
        const trimmedName = req.body.name.trim();
        const normalizedName = normalizeCategoryName(trimmedName);
        if (normalizedName !== category.normalizedName) {
          const existing = await CategoryRepository.findByNormalizedName(normalizedName, tx);
          if (existing && existing.id !== categoryId) {
            throw new AppError("Category name already exists", 409);
          }
        }
        updates.name = trimmedName;
        updates.normalizedName = normalizedName;
      }
      if (req.body.description !== undefined) {
        updates.description = req.body.description?.trim?.() || null;
      }
      if (req.body.jobs !== undefined) updates.jobs = normalizeJobs(req.body.jobs);
      if (req.body.workflows !== undefined)
        updates.workflows = normalizeWorkflows(req.body.workflows);
      if (imageUrl !== undefined) updates.image = imageUrl;

      return CategoryRepository.updateById(categoryId, updates, tx);
    });

    await publishToQueue(CATEGORY_QUEUE_EVENTS.UPDATED, {
      categoryId: updatedCategory.id,
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
      categoryId: updatedCategory.id,
      name: updatedCategory.name,
      isActive: updatedCategory.isActive,
    });

    return {
      success: true,
      message: "Category deactivated successfully",
    };
  }
}