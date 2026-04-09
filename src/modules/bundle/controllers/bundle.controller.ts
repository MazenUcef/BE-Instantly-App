import { Response } from "express";
import { BundleService } from "../services/bundle.service";

export const createBundle = async (req: any, res: Response) => {
  const result = await BundleService.createBundle({
    supplierId: req.user.userId,
    categoryId: req.body.categoryId,
    governmentIds: req.body.governmentIds,
    title: req.body.title,
    subtitle: req.body.subtitle,
    description: req.body.description,
    image: req.body.image,
    price: Number(req.body.price),
    oldPrice: req.body.oldPrice !== undefined ? Number(req.body.oldPrice) : null,
    durationMinutes: Number(req.body.durationMinutes),
    includes: req.body.includes,
    tags: req.body.tags,
    selectedWorkflow: req.body.selectedWorkflow,
  });

  return res.status(201).json(result);
};

export const getAllBundles = async (req: any, res: Response) => {
  const result = await BundleService.getAllBundles({
    categoryId: req.query.categoryId as string | undefined,
    governmentId: req.query.governmentId as string | undefined,
    supplierId: req.query.supplierId as string | undefined,
  });

  return res.status(200).json(result);
};

export const getBundleById = async (req: any, res: Response) => {
  const result = await BundleService.getBundleById({
    bundleId: req.params.id,
  });

  return res.status(200).json(result);
};

export const getMyBundles = async (req: any, res: Response) => {
  const result = await BundleService.getMyBundles({
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const updateBundle = async (req: any, res: Response) => {
  const result = await BundleService.updateBundle({
    supplierId: req.user.userId,
    bundleId: req.params.id,
    updates: req.body,
  });

  return res.status(200).json(result);
};

export const toggleBundleStatus = async (req: any, res: Response) => {
  const result = await BundleService.toggleBundleStatus({
    supplierId: req.user.userId,
    bundleId: req.params.id,
  });

  return res.status(200).json(result);
};

export const deleteBundle = async (req: any, res: Response) => {
  const result = await BundleService.deleteBundle({
    supplierId: req.user.userId,
    bundleId: req.params.id,
  });

  return res.status(200).json(result);
};