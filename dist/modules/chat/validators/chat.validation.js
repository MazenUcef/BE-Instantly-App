"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMarkMessagesAsRead = exports.validateGetMessagesBySession = exports.validateSendMessage = exports.handleValidationErrors = void 0;
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
exports.validateSendMessage = [
    (0, express_validator_1.body)("sessionId")
        .notEmpty()
        .withMessage("Session ID is required")
        .bail()
        .isMongoId()
        .withMessage("Invalid session ID"),
    (0, express_validator_1.body)("message")
        .notEmpty()
        .withMessage("Message is required")
        .bail()
        .isString()
        .withMessage("Message must be a string")
        .bail()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage("Message must be between 1 and 5000 characters"),
    exports.handleValidationErrors,
];
exports.validateGetMessagesBySession = [
    (0, express_validator_1.param)("sessionId").isMongoId().withMessage("Invalid session ID"),
    (0, express_validator_1.query)("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer")
        .toInt(),
    (0, express_validator_1.query)("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100")
        .toInt(),
    exports.handleValidationErrors,
];
exports.validateMarkMessagesAsRead = [
    (0, express_validator_1.param)("sessionId").isMongoId().withMessage("Invalid session ID"),
    exports.handleValidationErrors,
];
