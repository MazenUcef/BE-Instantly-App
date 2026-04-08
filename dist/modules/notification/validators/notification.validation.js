"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNotificationListQuery = exports.validateNotificationIdParam = exports.validateCreateNotification = void 0;
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
exports.validateCreateNotification = [
    (0, express_validator_1.body)("userId").notEmpty().isMongoId().withMessage("Valid userId is required"),
    (0, express_validator_1.body)("type").notEmpty().isString().trim().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)("title").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("message").notEmpty().isString().trim().isLength({ min: 1, max: 2000 }),
    (0, express_validator_1.body)("data").optional().isObject().withMessage("data must be an object"),
    handleValidationErrors,
];
exports.validateNotificationIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid notification id"),
    handleValidationErrors,
];
exports.validateNotificationListQuery = [
    (0, express_validator_1.query)("page").optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidationErrors,
];
