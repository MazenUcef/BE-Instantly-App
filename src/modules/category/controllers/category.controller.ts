import { Request, Response } from "express";
import { Types } from "mongoose";
import Category from "../models/Category.model";
import { IAuthRequest } from "../../../shared/types";
import { publishToQueue } from "../../../shared/config/rabbitmq";
import { uploadToCloudinary } from "../../../shared/utils/cloudinary";
import { validateFile } from "../../../shared/utils/helpers";


export const createCategory = async (req: IAuthRequest, res: Response) => {
  console.log("req.body", req.body);
  console.log("req.files", req.files);
  
  try {
    const files = req.files as any;
    let { name, description, jobs } = req.body;
    if (typeof jobs === 'string') {
      try {
        jobs = JSON.parse(jobs);
      } catch (e) {
        console.log("Error parsing jobs:", e);
      }
    }

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const isMultipart = !!files && Object.keys(files).length > 0;

    if (isMultipart) {
      if (!files?.image?.[0]) {
        return res.status(400).json({ message: "Category image is required" });
      }

      try {
        validateFile(files.image[0]);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }

      const imageUpload = await uploadToCloudinary(files.image[0]);
      
      const existingCategory = await Category.findOne({
        name: name.trim(),
      });

      if (existingCategory) {
        return res.status(400).json({ message: "Category already exists" });
      }

      const category = await Category.create({
        name: name.trim(),
        description,
        image: imageUpload.secure_url,
        jobs: Array.isArray(jobs) ? jobs : [],
      });

      await publishToQueue("CATEGORY_CREATED", {
        categoryId: category._id,
        name: category.name,
        description: category.description,
        image: category.image,
        jobs: category.jobs,
      });

      return res.status(201).json({
        message: "Category created successfully",
        data: category,
      });
    } else {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ message: "Category image URL is required" });
      }

      const existingCategory = await Category.findOne({
        name: name.trim(),
      });

      if (existingCategory) {
        return res.status(400).json({ message: "Category already exists" });
      }

      const category = await Category.create({
        name: name.trim(),
        description,
        image,
        jobs: Array.isArray(jobs) ? jobs : [],
      });

      await publishToQueue("CATEGORY_CREATED", {
        categoryId: category._id,
        name: category.name,
        description: category.description,
        image: category.image,
        jobs: category.jobs,
      });

      return res.status(201).json({
        message: "Category created successfully",
        data: category,
      });
    }
  } catch (error: any) {
    console.error("Error creating category:", error);
    return res.status(500).json({
      message: "Failed to create category",
      error: error.message,
    });
  }
};

export const getAllCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });

    return res.status(200).json({
      count: categories.length,
      data: categories,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.status(200).json({
      data: category,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to fetch category",
      error: error.message,
    });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, jobs } = req.body;
    const files = req.files as any;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Update name if provided and different
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({ name: name.trim() });
      if (existingCategory) {
        return res.status(400).json({ message: "Category name already exists" });
      }
      category.name = name.trim();
    }

    // Update description if provided
    if (description !== undefined) {
      category.description = description;
    }

    // Update jobs if provided
    if (Array.isArray(jobs)) {
      category.jobs = jobs;
    }

    // Update image if a new one is provided
    if (files?.image?.[0]) {
      try {
        validateFile(files.image[0]);
        const imageUpload = await uploadToCloudinary(files.image[0]);
        category.image = imageUpload.secure_url;
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }

    await category.save();

    return res.status(200).json({
      message: "Category updated successfully",
      data: category,
    });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return res.status(500).json({
      message: "Failed to update category",
      error: error.message,
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await category.deleteOne();

    return res.status(200).json({
      message: "Category deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
};