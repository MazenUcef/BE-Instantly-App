import { Request, Response } from "express";
import { Types } from "mongoose";
import Government from "../models/Government.model";
import { IAuthRequest } from "../../../shared/types";
import { publishToQueue } from "../../../shared/config/rabbitmq";

export const createGovernment = async (req: IAuthRequest, res: Response) => {
  try {
    const { name, nameAr, country, order } = req.body;

    if (!name || !nameAr) {
      return res.status(400).json({ 
        message: "Government name in both languages is required" 
      });
    }

    const existingGovernment = await Government.findOne({
      $or: [
        { name: name.trim() },
        { nameAr: nameAr.trim() }
      ]
    });

    if (existingGovernment) {
      return res.status(400).json({ 
        message: "Government already exists" 
      });
    }

    const government = await Government.create({
      name: name.trim(),
      nameAr: nameAr.trim(),
      country: country || "Egypt",
      order: order || 0,
      isActive: true,
    });

    await publishToQueue("GOVERNMENT_CREATED", {
      governmentId: government._id,
      name: government.name,
      nameAr: government.nameAr,
    });

    return res.status(201).json({
      message: "Government created successfully",
      data: government,
    });
  } catch (error) {
    console.error("Create government error:", error);
    res.status(500).json({ message: "Failed to create government" });
  }
};

export const getAllGovernments = async (_req: Request, res: Response) => {
  try {
    const governments = await Government.find({ isActive: true })
      .sort({ order: 1, name: 1 });

    return res.status(200).json({
      count: governments.length,
      data: governments,
    });
  } catch (error) {
    console.error("Get governments error:", error);
    res.status(500).json({ message: "Failed to fetch governments" });
  }
};

export const getAllGovernmentsAdmin = async (_req: Request, res: Response) => {
  try {
    const governments = await Government.find()
      .sort({ order: 1, name: 1 });

    return res.status(200).json({
      count: governments.length,
      data: governments,
    });
  } catch (error) {
    console.error("Get governments admin error:", error);
    res.status(500).json({ message: "Failed to fetch governments" });
  }
};

export const getGovernmentById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid government ID" });
    }

    const government = await Government.findById(id);

    if (!government) {
      return res.status(404).json({ message: "Government not found" });
    }

    return res.status(200).json({
      data: government,
    });
  } catch (error) {
    console.error("Get government error:", error);
    res.status(500).json({ message: "Failed to fetch government" });
  }
};

export const updateGovernment = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, nameAr, country, isActive, order } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid government ID" });
    }

    const government = await Government.findById(id);

    if (!government) {
      return res.status(404).json({ message: "Government not found" });
    }

    if (name && name.trim() !== government.name) {
      const existing = await Government.findOne({ name: name.trim() });
      if (existing) {
        return res.status(400).json({ message: "Government name already exists" });
      }
      government.name = name.trim();
    }

    if (nameAr && nameAr.trim() !== government.nameAr) {
      const existing = await Government.findOne({ nameAr: nameAr.trim() });
      if (existing) {
        return res.status(400).json({ message: "Government Arabic name already exists" });
      }
      government.nameAr = nameAr.trim();
    }

    if (country !== undefined) government.country = country;
    if (isActive !== undefined) government.isActive = isActive;
    if (order !== undefined) government.order = order;

    await government.save();

    return res.status(200).json({
      message: "Government updated successfully",
      data: government,
    });
  } catch (error) {
    console.error("Update government error:", error);
    res.status(500).json({ message: "Failed to update government" });
  }
};

export const deleteGovernment = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid government ID" });
    }

    const government = await Government.findById(id);

    if (!government) {
      return res.status(404).json({ message: "Government not found" });
    }

    government.isActive = false;
    await government.save();

    return res.status(200).json({
      message: "Government deactivated successfully",
    });
  } catch (error) {
    console.error("Delete government error:", error);
    res.status(500).json({ message: "Failed to delete government" });
  }
};

export const toggleGovernmentStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid government ID" });
    }

    const government = await Government.findById(id);

    if (!government) {
      return res.status(404).json({ message: "Government not found" });
    }

    government.isActive = !government.isActive;
    await government.save();

    return res.status(200).json({
      message: `Government ${government.isActive ? 'activated' : 'deactivated'} successfully`,
      data: government,
    });
  } catch (error) {
    console.error("Toggle government error:", error);
    res.status(500).json({ message: "Failed to toggle government status" });
  }
};