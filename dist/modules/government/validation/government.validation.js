"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToggleGovernmentStatus = exports.validateDeleteGovernment = exports.validateUpdateGovernment = exports.validateGetGovernmentById = exports.validateCreateGovernment = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
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
exports.validateCreateGovernment = [
    (0, express_validator_1.body)("name")
        .notEmpty()
        .withMessage("Government name is required")
        .bail()
        .isString()
        .withMessage("Government name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Government name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("nameAr")
        .notEmpty()
        .withMessage("Government Arabic name is required")
        .bail()
        .isString()
        .withMessage("Government Arabic name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Government Arabic name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("country")
        .optional()
        .isString()
        .withMessage("Country must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Country must be between 2 and 100 characters"),
    (0, express_validator_1.body)("order")
        .optional()
        .isInt({ min: 0 })
        .withMessage("Order must be a non-negative integer")
        .toInt(),
    exports.handleValidationErrors,
];
exports.validateGetGovernmentById = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid government ID"),
    exports.handleValidationErrors,
];
exports.validateUpdateGovernment = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid government ID"),
    (0, express_validator_1.body)("name")
        .optional()
        .isString()
        .withMessage("Government name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Government name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("nameAr")
        .optional()
        .isString()
        .withMessage("Government Arabic name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Government Arabic name must be between 2 and 100 characters"),
    (0, express_validator_1.body)("country")
        .optional()
        .isString()
        .withMessage("Country must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Country must be between 2 and 100 characters"),
    (0, express_validator_1.body)("order")
        .optional()
        .isInt({ min: 0 })
        .withMessage("Order must be a non-negative integer")
        .toInt(),
    (0, express_validator_1.body)("isActive")
        .optional()
        .isBoolean()
        .withMessage("isActive must be a boolean")
        .toBoolean(),
    exports.handleValidationErrors,
];
exports.validateDeleteGovernment = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid government ID"),
    exports.handleValidationErrors,
];
exports.validateToggleGovernmentStatus = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid government ID"),
    exports.handleValidationErrors,
];
