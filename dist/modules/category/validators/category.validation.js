"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDeleteCategory = exports.validateUpdateCategory = exports.validateGetCategoryById = exports.validateCreateCategory = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const multer_1 = __importDefault(require("../../../shared/config/multer"));
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
        });
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
const parseJobsIfNeeded = (req, _res, next) => {
    if (typeof req.body.jobs === "string") {
        try {
            req.body.jobs = JSON.parse(req.body.jobs);
        }
        catch {
            // leave as-is, validator will fail
        }
    }
    next();
};
exports.validateCreateCategory = [
    multer_1.default.fields([{ name: "image", maxCount: 1 }]),
    parseJobsIfNeeded,
    (0, express_validator_1.body)("name")
        .notEmpty()
        .withMessage("Category name is required")
        .bail()
        .isString()
        .withMessage("Category name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Category name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("description")
        .optional({ nullable: true })
        .isString()
        .withMessage("Description must be a string")
        .bail()
        .trim()
        .isLength({ max: 1000 })
        .withMessage("Description cannot exceed 1000 characters"),
    (0, express_validator_1.body)("image")
        .optional()
        .isString()
        .withMessage("Image must be a string URL")
        .bail()
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage("Image URL is invalid"),
    (0, express_validator_1.body)("jobs")
        .optional()
        .isArray()
        .withMessage("Jobs must be an array"),
    (0, express_validator_1.body)("jobs.*")
        .optional()
        .isString()
        .withMessage("Each job must be a string")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("Job cannot be empty")
        .bail()
        .isLength({ min: 2, max: 100 })
        .withMessage("Each job must be between 2 and 100 characters"),
    exports.handleValidationErrors,
];
exports.validateGetCategoryById = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid category ID"),
    exports.handleValidationErrors,
];
exports.validateUpdateCategory = [
    multer_1.default.fields([{ name: "image", maxCount: 1 }]),
    parseJobsIfNeeded,
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid category ID"),
    (0, express_validator_1.body)("name")
        .optional()
        .isString()
        .withMessage("Category name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Category name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("description")
        .optional({ nullable: true })
        .isString()
        .withMessage("Description must be a string")
        .bail()
        .trim()
        .isLength({ max: 1000 })
        .withMessage("Description cannot exceed 1000 characters"),
    (0, express_validator_1.body)("image")
        .optional()
        .isString()
        .withMessage("Image must be a string URL")
        .bail()
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage("Image URL is invalid"),
    (0, express_validator_1.body)("jobs")
        .optional()
        .isArray()
        .withMessage("Jobs must be an array"),
    (0, express_validator_1.body)("jobs.*")
        .optional()
        .isString()
        .withMessage("Each job must be a string")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("Job cannot be empty")
        .bail()
        .isLength({ min: 2, max: 100 })
        .withMessage("Each job must be between 2 and 100 characters"),
    exports.handleValidationErrors,
];
exports.validateDeleteCategory = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid category ID"),
    exports.handleValidationErrors,
];
