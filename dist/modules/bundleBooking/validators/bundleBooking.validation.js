"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBookingStatusQuery = exports.validateRejectBooking = exports.validateBookingIdParam = exports.validateCreateBundleBooking = void 0;
const express_validator_1 = require("express-validator");
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
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
exports.validateCreateBundleBooking = [
    (0, express_validator_1.body)("bundleId")
        .notEmpty()
        .isMongoId()
        .withMessage("Valid bundleId is required"),
    (0, express_validator_1.body)("governmentId")
        .notEmpty()
        .isMongoId()
        .withMessage("Valid governmentId is required"),
    (0, express_validator_1.body)("address").notEmpty().isString().trim().isLength({ min: 3, max: 500 }),
    (0, express_validator_1.body)("notes")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 2000 }),
    (0, express_validator_1.body)("bookedDate")
        .notEmpty()
        .isISO8601()
        .withMessage("bookedDate must be valid"),
    (0, express_validator_1.body)("slotStart")
        .notEmpty()
        .matches(TIME_REGEX)
        .withMessage("slotStart must be HH:mm"),
    (0, express_validator_1.body)("slotEnd")
        .notEmpty()
        .matches(TIME_REGEX)
        .withMessage("slotEnd must be HH:mm"),
    (0, express_validator_1.body)("scheduledAt")
        .notEmpty()
        .isISO8601()
        .withMessage("scheduledAt must be valid"),
    handleValidationErrors,
];
exports.validateBookingIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid booking id"),
    handleValidationErrors,
];
exports.validateRejectBooking = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid booking id"),
    (0, express_validator_1.body)("rejectionReason")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 500 }),
    handleValidationErrors,
];
exports.validateBookingStatusQuery = [
    (0, express_validator_1.query)("status").optional().isString().trim(),
    handleValidationErrors,
];
