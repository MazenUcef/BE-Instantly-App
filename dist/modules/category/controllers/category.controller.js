"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.getCategoryById = exports.getAllCategories = exports.createCategory = void 0;
const mongoose_1 = require("mongoose");
const Category_model_1 = __importDefault(require("../models/Category.model"));
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const createCategory = async (req, res) => {
    const { name, description, icon, jobs } = req.body;
    if (!name) {
        return res.status(400).json({ message: "Category name is required" });
    }
    const existingCategory = await Category_model_1.default.findOne({
        name: name.trim(),
    });
    if (existingCategory) {
        return res.status(400).json({ message: "Category already exists" });
    }
    const category = await Category_model_1.default.create({
        name: name.trim(),
        description,
        icon,
        jobs: Array.isArray(jobs) ? jobs : [],
    });
    await (0, rabbitmq_1.publishToQueue)("CATEGORY_CREATED", {
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
exports.createCategory = createCategory;
const getAllCategories = async (_req, res) => {
    const categories = await Category_model_1.default.find().sort({ createdAt: -1 });
    return res.status(200).json({
        count: categories.length,
        data: categories,
    });
};
exports.getAllCategories = getAllCategories;
const getCategoryById = async (req, res) => {
    const id = req.params.id;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid category ID" });
    }
    const category = await Category_model_1.default.findById(id);
    if (!category) {
        return res.status(404).json({ message: "Category not found" });
    }
    return res.status(200).json({
        data: category,
    });
};
exports.getCategoryById = getCategoryById;
const updateCategory = async (req, res) => {
    const id = req.params.id;
    const { name, description, icon, jobs } = req.body;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid category ID" });
    }
    const category = await Category_model_1.default.findById(id);
    if (!category) {
        return res.status(404).json({ message: "Category not found" });
    }
    if (name && name.trim() !== category.name) {
        const existingCategory = await Category_model_1.default.findOne({ name: name.trim() });
        if (existingCategory) {
            return res.status(400).json({ message: "Category name already exists" });
        }
        category.name = name.trim();
    }
    if (description !== undefined)
        category.description = description;
    if (icon !== undefined)
        category.icon = icon;
    if (Array.isArray(jobs))
        category.jobs = jobs;
    await category.save();
    return res.status(200).json({
        message: "Category updated successfully",
        data: category,
    });
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    const id = req.params.id;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid category ID" });
    }
    const category = await Category_model_1.default.findById(id);
    if (!category) {
        return res.status(404).json({ message: "Category not found" });
    }
    await category.deleteOne();
    return res.status(200).json({
        message: "Category deleted successfully",
    });
};
exports.deleteCategory = deleteCategory;
