"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOrderHistoryQuery = exports.validateUpdateOrderPrice = exports.validateOrderIdParam = exports.validateCreateOrder = void 0;
const express_validator_1 = require("express-validator");
const order_constants_1 = require("../../../shared/constants/order.constants");
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
exports.validateCreateOrder = [
    (0, express_validator_1.body)("address").notEmpty().isString().trim().isLength({ min: 3, max: 500 }),
    (0, express_validator_1.body)("description").notEmpty().isString().trim().isLength({ min: 3, max: 5000 }),
    (0, express_validator_1.body)("categoryId").notEmpty().isMongoId().withMessage("Valid categoryId is required"),
    (0, express_validator_1.body)("governmentId").notEmpty().isMongoId().withMessage("Valid governmentId is required"),
    (0, express_validator_1.body)("jobTitle").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("requestedPrice").notEmpty().isFloat({ min: 1 }).withMessage("requestedPrice must be >= 1"),
    (0, express_validator_1.body)("orderType")
        .notEmpty()
        .isIn(Object.values(order_constants_1.ORDER_TYPE))
        .withMessage("Invalid orderType"),
    (0, express_validator_1.body)("selectedWorkflow")
        .notEmpty()
        .isString()
        .withMessage("selectedWorkflow is required")
        .bail()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("selectedWorkflow must be between 2 and 50 characters"),
    (0, express_validator_1.body)("timeToStart")
        .optional({ nullable: true })
        .isISO8601()
        .withMessage("timeToStart must be a valid ISO date"),
    handleValidationErrors,
];
exports.validateOrderIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid order id"),
    handleValidationErrors,
];
exports.validateUpdateOrderPrice = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid order id"),
    (0, express_validator_1.body)("requestedPrice").notEmpty().isFloat({ min: 1 }).withMessage("requestedPrice must be >= 1"),
    handleValidationErrors,
];
exports.validateOrderHistoryQuery = [
    (0, express_validator_1.query)("page").optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidationErrors,
];
