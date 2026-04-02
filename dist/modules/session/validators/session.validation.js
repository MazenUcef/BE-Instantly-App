"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateSessionStatus = exports.validateUserIdParam = exports.validateOrderIdParam = exports.validateSessionPaymentParam = exports.validateSessionIdParam = exports.validateCreateSession = void 0;
const express_validator_1 = require("express-validator");
const session_constants_1 = require("../../../shared/constants/session.constants");
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
exports.validateCreateSession = [
    (0, express_validator_1.body)("orderId").notEmpty().isMongoId().withMessage("Valid orderId is required"),
    (0, express_validator_1.body)("offerId").notEmpty().isMongoId().withMessage("Valid offerId is required"),
    (0, express_validator_1.body)("customerId").notEmpty().isMongoId().withMessage("Valid customerId is required"),
    (0, express_validator_1.body)("supplierId").notEmpty().isMongoId().withMessage("Valid supplierId is required"),
    handleValidationErrors,
];
exports.validateSessionIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid session id"),
    handleValidationErrors,
];
exports.validateSessionPaymentParam = [
    (0, express_validator_1.param)("sessionId").isMongoId().withMessage("Invalid session id"),
    handleValidationErrors,
];
exports.validateOrderIdParam = [
    (0, express_validator_1.param)("orderId").isMongoId().withMessage("Invalid order id"),
    handleValidationErrors,
];
exports.validateUserIdParam = [
    (0, express_validator_1.param)("userId").isMongoId().withMessage("Invalid user id"),
    handleValidationErrors,
];
exports.validateUpdateSessionStatus = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid session id"),
    (0, express_validator_1.body)("status")
        .notEmpty()
        .isIn([
        session_constants_1.SESSION_STATUS.ON_THE_WAY,
        session_constants_1.SESSION_STATUS.ARRIVED,
        session_constants_1.SESSION_STATUS.WORK_STARTED,
        session_constants_1.SESSION_STATUS.CANCELLED,
    ])
        .withMessage("Invalid status"),
    (0, express_validator_1.body)("reason")
        .optional()
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Invalid reason"),
    handleValidationErrors,
];
