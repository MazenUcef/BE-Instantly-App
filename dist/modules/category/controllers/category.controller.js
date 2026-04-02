"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.getCategoryById = exports.getAllCategories = exports.createCategory = void 0;
const category_service_1 = require("../services/category.service");
const createCategory = async (req, res) => {
    const result = await category_service_1.CategoryService.createCategory(req);
    return res.status(201).json(result);
};
exports.createCategory = createCategory;
const getAllCategories = async (_req, res) => {
    const result = await category_service_1.CategoryService.getAllCategories(false);
    return res.status(200).json(result);
};
exports.getAllCategories = getAllCategories;
const getCategoryById = async (req, res) => {
    const result = await category_service_1.CategoryService.getCategoryById(req.params.id);
    return res.status(200).json(result);
};
exports.getCategoryById = getCategoryById;
const updateCategory = async (req, res) => {
    const result = await category_service_1.CategoryService.updateCategory(req);
    return res.status(200).json(result);
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    const result = await category_service_1.CategoryService.deleteCategory(req.params.id);
    return res.status(200).json(result);
};
exports.deleteCategory = deleteCategory;
