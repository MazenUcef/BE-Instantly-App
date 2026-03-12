"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleGovernmentStatus = exports.deleteGovernment = exports.updateGovernment = exports.getGovernmentById = exports.getAllGovernmentsAdmin = exports.getAllGovernments = exports.createGovernment = void 0;
const mongoose_1 = require("mongoose");
const Government_model_1 = __importDefault(require("../models/Government.model"));
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const createGovernment = async (req, res) => {
    try {
        const { name, nameAr, country, order } = req.body;
        if (!name || !nameAr) {
            return res.status(400).json({
                message: "Government name in both languages is required"
            });
        }
        const existingGovernment = await Government_model_1.default.findOne({
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
        const government = await Government_model_1.default.create({
            name: name.trim(),
            nameAr: nameAr.trim(),
            country: country || "Egypt",
            order: order || 0,
            isActive: true,
        });
        await (0, rabbitmq_1.publishToQueue)("GOVERNMENT_CREATED", {
            governmentId: government._id,
            name: government.name,
            nameAr: government.nameAr,
        });
        return res.status(201).json({
            message: "Government created successfully",
            data: government,
        });
    }
    catch (error) {
        console.error("Create government error:", error);
        res.status(500).json({ message: "Failed to create government" });
    }
};
exports.createGovernment = createGovernment;
const getAllGovernments = async (_req, res) => {
    try {
        const governments = await Government_model_1.default.find({ isActive: true })
            .sort({ order: 1, name: 1 });
        return res.status(200).json({
            count: governments.length,
            data: governments,
        });
    }
    catch (error) {
        console.error("Get governments error:", error);
        res.status(500).json({ message: "Failed to fetch governments" });
    }
};
exports.getAllGovernments = getAllGovernments;
const getAllGovernmentsAdmin = async (_req, res) => {
    try {
        const governments = await Government_model_1.default.find()
            .sort({ order: 1, name: 1 });
        return res.status(200).json({
            count: governments.length,
            data: governments,
        });
    }
    catch (error) {
        console.error("Get governments admin error:", error);
        res.status(500).json({ message: "Failed to fetch governments" });
    }
};
exports.getAllGovernmentsAdmin = getAllGovernmentsAdmin;
const getGovernmentById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid government ID" });
        }
        const government = await Government_model_1.default.findById(id);
        if (!government) {
            return res.status(404).json({ message: "Government not found" });
        }
        return res.status(200).json({
            data: government,
        });
    }
    catch (error) {
        console.error("Get government error:", error);
        res.status(500).json({ message: "Failed to fetch government" });
    }
};
exports.getGovernmentById = getGovernmentById;
const updateGovernment = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, nameAr, country, isActive, order } = req.body;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid government ID" });
        }
        const government = await Government_model_1.default.findById(id);
        if (!government) {
            return res.status(404).json({ message: "Government not found" });
        }
        if (name && name.trim() !== government.name) {
            const existing = await Government_model_1.default.findOne({ name: name.trim() });
            if (existing) {
                return res.status(400).json({ message: "Government name already exists" });
            }
            government.name = name.trim();
        }
        if (nameAr && nameAr.trim() !== government.nameAr) {
            const existing = await Government_model_1.default.findOne({ nameAr: nameAr.trim() });
            if (existing) {
                return res.status(400).json({ message: "Government Arabic name already exists" });
            }
            government.nameAr = nameAr.trim();
        }
        if (country !== undefined)
            government.country = country;
        if (isActive !== undefined)
            government.isActive = isActive;
        if (order !== undefined)
            government.order = order;
        await government.save();
        return res.status(200).json({
            message: "Government updated successfully",
            data: government,
        });
    }
    catch (error) {
        console.error("Update government error:", error);
        res.status(500).json({ message: "Failed to update government" });
    }
};
exports.updateGovernment = updateGovernment;
const deleteGovernment = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid government ID" });
        }
        const government = await Government_model_1.default.findById(id);
        if (!government) {
            return res.status(404).json({ message: "Government not found" });
        }
        government.isActive = false;
        await government.save();
        return res.status(200).json({
            message: "Government deactivated successfully",
        });
    }
    catch (error) {
        console.error("Delete government error:", error);
        res.status(500).json({ message: "Failed to delete government" });
    }
};
exports.deleteGovernment = deleteGovernment;
const toggleGovernmentStatus = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid government ID" });
        }
        const government = await Government_model_1.default.findById(id);
        if (!government) {
            return res.status(404).json({ message: "Government not found" });
        }
        government.isActive = !government.isActive;
        await government.save();
        return res.status(200).json({
            message: `Government ${government.isActive ? 'activated' : 'deactivated'} successfully`,
            data: government,
        });
    }
    catch (error) {
        console.error("Toggle government error:", error);
        res.status(500).json({ message: "Failed to toggle government status" });
    }
};
exports.toggleGovernmentStatus = toggleGovernmentStatus;
