import { Request, Response } from "express";
import { Types } from "mongoose";
import Category from "../models/Category.model";
import { IAuthRequest } from "../../../shared/types";
import { publishToQueue } from "../../../shared/config/rabbitmq";

export const createCategory = async (req: IAuthRequest, res: Response) => {
  const { name, description, icon, jobs } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
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
    icon,
    jobs: Array.isArray(jobs) ? jobs : [],
  });

  await publishToQueue("CATEGORY_CREATED", {
    categoryId: category._id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    jobs: category.jobs,
  });

  return res.status(201).json({
    message: "Category created successfully",
    data: category,
  });
};

export const getAllCategories = async (_req: Request, res: Response) => {
  const categories = await Category.find().sort({ createdAt: -1 });

  return res.status(200).json({
    count: categories.length,
    data: categories,
  });
};

export const getCategoryById = async (req: Request, res: Response) => {
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
};

export const updateCategory = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, description, icon, jobs } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid category ID" });
  }

  const category = await Category.findById(id);

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  if (name && name.trim() !== category.name) {
    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    category.name = name.trim();
  }

  if (description !== undefined) category.description = description;
  if (icon !== undefined) category.icon = icon;
  if (Array.isArray(jobs)) category.jobs = jobs;

  await category.save();

  return res.status(200).json({
    message: "Category updated successfully",
    data: category,
  });
};

export const deleteCategory = async (req: Request, res: Response) => {
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
};
