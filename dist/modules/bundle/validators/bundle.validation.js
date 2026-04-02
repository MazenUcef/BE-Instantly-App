"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGetBundlesQuery = exports.validateBundleIdParam = exports.validateUpdateBundle = exports.validateCreateBundle = void 0;
const express_validator_1 = require("express-validator");
const bundle_constants_1 = require("../../../shared/constants/bundle.constants");
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
exports.validateCreateBundle = [
    (0, express_validator_1.body)("categoryId")
        .optional()
        .isMongoId()
        .withMessage("categoryId must be a valid MongoId"),
    (0, express_validator_1.body)("governmentIds")
        .optional()
        .isArray({ min: 1 })
        .withMessage("governmentIds must be a non-empty array"),
    (0, express_validator_1.body)("governmentIds.*")
        .optional()
        .isMongoId()
        .withMessage("Each governmentId must be valid"),
    (0, express_validator_1.body)("title").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("subtitle")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 250 }),
    (0, express_validator_1.body)("description")
        .notEmpty()
        .isString()
        .trim()
        .isLength({ min: 1, max: 4000 }),
    (0, express_validator_1.body)("image")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 2000 }),
    (0, express_validator_1.body)("price")
        .notEmpty()
        .isFloat({ min: 1 })
        .withMessage("price must be >= 1"),
    (0, express_validator_1.body)("oldPrice").optional({ nullable: true }).isFloat({ min: 1 }),
    (0, express_validator_1.body)("durationMinutes")
        .notEmpty()
        .isInt()
        .custom((value) => bundle_constants_1.BUNDLE_ALLOWED_DURATIONS.includes(Number(value)))
        .withMessage("Invalid durationMinutes"),
    (0, express_validator_1.body)("includes").optional().isArray(),
    (0, express_validator_1.body)("includes.*")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("tags").optional().isArray(),
    (0, express_validator_1.body)("tags.*").optional().isString().trim().isLength({ min: 1, max: 100 }),
    handleValidationErrors,
];
exports.validateUpdateBundle = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid bundle id"),
    (0, express_validator_1.body)("categoryId").optional().isMongoId(),
    (0, express_validator_1.body)("governmentIds").optional().isArray({ min: 1 }),
    (0, express_validator_1.body)("governmentIds.*").optional().isMongoId(),
    (0, express_validator_1.body)("title").optional().isString().trim().isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("subtitle")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 250 }),
    (0, express_validator_1.body)("description")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 4000 }),
    (0, express_validator_1.body)("image")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 2000 }),
    (0, express_validator_1.body)("price").optional().isFloat({ min: 1 }),
    (0, express_validator_1.body)("oldPrice").optional({ nullable: true }).isFloat({ min: 1 }),
    (0, express_validator_1.body)("durationMinutes")
        .optional()
        .isInt()
        .custom((value) => bundle_constants_1.BUNDLE_ALLOWED_DURATIONS.includes(Number(value)))
        .withMessage("Invalid durationMinutes"),
    (0, express_validator_1.body)("includes").optional().isArray(),
    (0, express_validator_1.body)("includes.*")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 }),
    (0, express_validator_1.body)("tags").optional().isArray(),
    (0, express_validator_1.body)("tags.*").optional().isString().trim().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)("isActive").optional().isBoolean(),
    handleValidationErrors,
];
exports.validateBundleIdParam = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid bundle id"),
    handleValidationErrors,
];
exports.validateGetBundlesQuery = [
    (0, express_validator_1.query)("categoryId").optional().isMongoId(),
    (0, express_validator_1.query)("governmentId").optional().isMongoId(),
    (0, express_validator_1.query)("supplierId").optional().isMongoId(),
    handleValidationErrors,
];
