"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSessionIdParam = exports.validateCallIdParam = exports.validateStartCall = void 0;
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
exports.validateStartCall = [
    (0, express_validator_1.body)("sessionId")
        .notEmpty()
        .isMongoId()
        .withMessage("Valid sessionId is required"),
    handleValidationErrors,
];
exports.validateCallIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid call id"),
    handleValidationErrors,
];
exports.validateSessionIdParam = [
    (0, express_validator_1.param)("sessionId").isMongoId().withMessage("Invalid session id"),
    handleValidationErrors,
];
