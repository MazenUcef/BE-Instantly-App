"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOfferHistoryQuery = exports.validateOrderIdParam = exports.validateOfferIdParam = exports.validateCreateOffer = void 0;
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
exports.validateCreateOffer = [
    (0, express_validator_1.body)("orderId")
        .notEmpty()
        .isMongoId()
        .withMessage("Valid orderId is required"),
    (0, express_validator_1.body)("amount")
        .notEmpty()
        .isFloat({ min: 1 })
        .withMessage("amount must be >= 1"),
    (0, express_validator_1.body)("timeRange")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("timeToStart")
        .optional({ nullable: true })
        .isISO8601()
        .withMessage("timeToStart must be a valid ISO date"),
    handleValidationErrors,
];
exports.validateOfferIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid offer id"),
    handleValidationErrors,
];
exports.validateOrderIdParam = [
    (0, express_validator_1.param)("orderId").isMongoId().withMessage("Invalid order id"),
    handleValidationErrors,
];
exports.validateOfferHistoryQuery = [
    (0, express_validator_1.query)("page").optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidationErrors,
];
