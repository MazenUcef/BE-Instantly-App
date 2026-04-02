import { Request, Response } from "express";
import { CategoryService } from "../services/category.service";

export const createCategory = async (req: Request, res: Response) => {
  const result = await CategoryService.createCategory(req);
  return res.status(201).json(result);
};

export const getAllCategories = async (_req: Request, res: Response) => {
  const result = await CategoryService.getAllCategories(false);
  return res.status(200).json(result);
};

export const getCategoryById = async (req: Request, res: Response) => {
  const result = await CategoryService.getCategoryById(req.params.id as string);
  return res.status(200).json(result);
};

export const updateCategory = async (req: Request, res: Response) => {
  const result = await CategoryService.updateCategory(req);
  return res.status(200).json(result);
};

export const deleteCategory = async (req: Request, res: Response) => {
  const result = await CategoryService.deleteCategory(req.params.id as string);
  return res.status(200).json(result);
};