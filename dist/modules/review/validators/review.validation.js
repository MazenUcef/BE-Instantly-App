"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGetUserReviews = exports.validateGetOrderReviews = exports.validateGetReviewById = exports.validateCreateReview = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const review_constants_1 = require("../../../shared/constants/review.constants");
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
exports.validateCreateReview = [
    (0, express_validator_1.body)("orderId")
        .notEmpty()
        .withMessage("Order ID is required")
        .bail()
        .isMongoId()
        .withMessage("Invalid order ID"),
    (0, express_validator_1.body)("rating")
        .notEmpty()
        .withMessage("Rating is required")
        .bail()
        .isInt({ min: 1, max: 5 })
        .withMessage("Rating must be an integer between 1 and 5")
        .toInt(),
    (0, express_validator_1.body)("comment")
        .notEmpty()
        .withMessage("Comment is required")
        .bail()
        .isString()
        .withMessage("Comment must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 1000 })
        .withMessage("Comment must be between 2 and 1000 characters"),
    (0, express_validator_1.body)("role")
        .notEmpty()
        .withMessage("Role is required")
        .bail()
        .isIn([review_constants_1.REVIEW_ROLES.CUSTOMER, review_constants_1.REVIEW_ROLES.SUPPLIER])
        .withMessage("Role must be either customer or supplier"),
    exports.handleValidationErrors,
];
exports.validateGetReviewById = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid review ID"),
    exports.handleValidationErrors,
];
exports.validateGetOrderReviews = [
    (0, express_validator_1.param)("orderId").isMongoId().withMessage("Invalid order ID"),
    exports.handleValidationErrors,
];
exports.validateGetUserReviews = [
    (0, express_validator_1.param)("userId").isMongoId().withMessage("Invalid user ID"),
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
