"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSupplierSlotsQuery = exports.validateBlockedDateId = exports.validateBlockDate = exports.validateUpsertAvailability = void 0;
const express_validator_1 = require("express-validator");
const availability_constants_1 = require("../../../shared/constants/availability.constants");
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
exports.validateUpsertAvailability = [
    (0, express_validator_1.body)("timezone").optional().isString().trim().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)("weeklySchedule").isArray({ min: 7, max: 7 }).withMessage("weeklySchedule must have 7 items"),
    (0, express_validator_1.body)("weeklySchedule.*.dayOfWeek")
        .isInt({ min: 0, max: 6 })
        .withMessage("dayOfWeek must be between 0 and 6"),
    (0, express_validator_1.body)("weeklySchedule.*.isWorking")
        .isBoolean()
        .withMessage("isWorking must be boolean"),
    (0, express_validator_1.body)("weeklySchedule.*.slotDurationMinutes")
        .isInt()
        .custom((value) => availability_constants_1.AVAILABILITY_ALLOWED_SLOT_DURATIONS.includes(Number(value)))
        .withMessage("Invalid slotDurationMinutes"),
    (0, express_validator_1.body)("weeklySchedule.*.startTime")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("startTime must be HH:mm"),
    (0, express_validator_1.body)("weeklySchedule.*.endTime")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("endTime must be HH:mm"),
    (0, express_validator_1.body)("weeklySchedule.*.breakStart")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("breakStart must be HH:mm"),
    (0, express_validator_1.body)("weeklySchedule.*.breakEnd")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("breakEnd must be HH:mm"),
    handleValidationErrors,
];
exports.validateBlockDate = [
    (0, express_validator_1.body)("date").notEmpty().isISO8601().withMessage("date must be a valid ISO date"),
    (0, express_validator_1.body)("reason").optional().isString().trim().isLength({ max: 300 }),
    (0, express_validator_1.body)("isFullDay").optional().isBoolean(),
    (0, express_validator_1.body)("startTime")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("startTime must be HH:mm"),
    (0, express_validator_1.body)("endTime")
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage("endTime must be HH:mm"),
    handleValidationErrors,
];
exports.validateBlockedDateId = [
    (0, express_validator_1.param)("blockedDateId").isMongoId().withMessage("Invalid blockedDateId"),
    handleValidationErrors,
];
exports.validateSupplierSlotsQuery = [
    (0, express_validator_1.param)("supplierId").isMongoId().withMessage("Invalid supplierId"),
    (0, express_validator_1.query)("date").notEmpty().isISO8601().withMessage("date query is required and must be valid"),
    handleValidationErrors,
];
