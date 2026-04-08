"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateOrder = exports.validateVerifyResetOTP = exports.validateResendVerification = exports.validateQueryParams = exports.validateIdParam = exports.validateUpdateCategory = exports.validateCreateCategory = exports.validateResetPassword = exports.validateForgotPassword = exports.validateRefreshToken = exports.validateLogin = exports.validateVerifyEmailOTP = exports.validateVerifyPhoneOTP = exports.validateRegister = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const multer_1 = __importDefault(require("../config/multer"));
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        console.log(errors.array());
        return res.status(400).json({
            success: false,
            errors: errors.array(),
            message: 'Validation failed'
        });
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
exports.validateRegister = [
    multer_1.default.fields([{ name: "profilePicture", maxCount: 1 }]),
    (req, res, next) => {
        const files = req.files;
        if (!files?.profilePicture?.[0]) {
            return res.status(400).json({
                success: false,
                message: "Profile picture is required",
            });
        }
        next();
    },
    (0, express_validator_1.body)("firstName")
        .notEmpty()
        .withMessage("First name is required")
        .isString()
        .withMessage("First name must be a string")
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("First name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
        .withMessage("First name can only contain letters and spaces"),
    (0, express_validator_1.body)("lastName")
        .notEmpty()
        .withMessage("Last name is required")
        .isString()
        .withMessage("Last name must be a string")
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Last name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
        .withMessage("Last name can only contain letters and spaces"),
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Invalid email format")
        .normalizeEmail()
        .isLength({ max: 100 })
        .withMessage("Email is too long"),
    (0, express_validator_1.body)("phoneNumber")
        .notEmpty()
        .withMessage("Phone number is required")
        .isString()
        .withMessage("Phone number must be a string")
        .trim()
        .matches(/^01[0-9]{9}$/)
        .withMessage("Phone number must be a valid Egyptian number (11 digits starting with 01)"),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .isString()
        .withMessage("Password must be a string")
        .isLength({ min: 8, max: 100 })
        .withMessage("Password must be between 8 and 100 characters")
        .matches(/[A-Z]/)
        .withMessage("Password must contain at least one uppercase letter")
        .matches(/[a-z]/)
        .withMessage("Password must contain at least one lowercase letter")
        .matches(/[0-9]/)
        .withMessage("Password must contain at least one number")
        .matches(/[!@#$%^&*(),.?":{}|<>]/)
        .withMessage("Password must contain at least one special character"),
    (0, express_validator_1.body)("address")
        .notEmpty()
        .withMessage("Address is required")
        .isString()
        .withMessage("Address must be a string")
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be between 5 and 200 characters"),
    (0, express_validator_1.body)("role")
        .optional()
        .isIn(["customer", "supplier"])
        .withMessage("Role must be either customer or supplier")
        .default("customer"),
    (0, express_validator_1.body)("categoryId")
        .if((0, express_validator_1.body)("role").equals("supplier"))
        .notEmpty()
        .withMessage("Category is required for supplier")
        .isString()
        .withMessage("Category ID must be a string")
        .trim()
        .isMongoId()
        .withMessage("Invalid category ID format"),
    (0, express_validator_1.body)("jobTitles")
        .if((0, express_validator_1.body)("role").equals("supplier"))
        .notEmpty()
        .withMessage("Job titles are required for supplier")
        .isArray()
        .withMessage("Job titles must be an array")
        .custom((value) => value.length > 0)
        .withMessage("At least one job title is required")
        .custom((value) => value.every((item) => typeof item === "string"))
        .withMessage("All job titles must be strings"),
    (0, express_validator_1.body)("jobTitles.*")
        .if((0, express_validator_1.body)("role").equals("supplier"))
        .isString()
        .withMessage("Each job title must be a string")
        .trim()
        .notEmpty()
        .withMessage("Job title cannot be empty")
        .isLength({ min: 2, max: 50 })
        .withMessage("Job title must be between 2 and 50 characters"),
    (0, express_validator_1.body)("governmentIds")
        .if((0, express_validator_1.body)("role").equals("supplier"))
        .notEmpty()
        .withMessage("Government/service areas are required for supplier")
        .isArray()
        .withMessage("Government IDs must be an array")
        .custom((value) => value.length > 0)
        .withMessage("At least one government/service area is required")
        .custom((value) => value.every((item) => typeof item === "string"))
        .withMessage("All government IDs must be strings"),
    (0, express_validator_1.body)("governmentIds.*")
        .if((0, express_validator_1.body)("role").equals("supplier"))
        .isString()
        .withMessage("Each government ID must be a string")
        .trim()
        .notEmpty()
        .withMessage("Government ID cannot be empty")
        .isMongoId()
        .withMessage("Invalid government ID format"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * VERIFY PHONE OTP
 * =========================
 */
exports.validateVerifyPhoneOTP = [
    (0, express_validator_1.body)("phoneNumber")
        .notEmpty()
        .withMessage("Phone number is required")
        .isString()
        .withMessage("Phone number must be a string")
        .trim()
        .isLength({ min: 10 })
        .withMessage("Invalid phone number"),
    (0, express_validator_1.body)("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .isString()
        .withMessage("OTP must be a string")
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be 6 digits")
        .isNumeric()
        .withMessage("OTP must contain only numbers"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * VERIFY EMAIL OTP
 * =========================
 */
exports.validateVerifyEmailOTP = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Invalid email")
        .normalizeEmail(),
    (0, express_validator_1.body)("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .isString()
        .withMessage("OTP must be a string")
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be 6 digits")
        .isNumeric()
        .withMessage("OTP must contain only numbers"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * LOGIN
 * =========================
 */
exports.validateLogin = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Invalid email")
        .normalizeEmail(),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .isString()
        .withMessage("Password must be a string")
        .notEmpty()
        .withMessage("Password required"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * REFRESH TOKEN
 * =========================
 */
exports.validateRefreshToken = [
    (0, express_validator_1.body)("refreshToken")
        .isString()
        .withMessage("Refresh token must be a string")
        .isLength({ min: 10 })
        .withMessage("Invalid refresh token"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * FORGOT PASSWORD
 * =========================
 */
exports.validateForgotPassword = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Invalid email")
        .normalizeEmail(),
    exports.handleValidationErrors,
];
/**
 * =========================
 * RESET PASSWORD
 * =========================
 */
exports.validateResetPassword = [
    (0, express_validator_1.body)("token")
        .isString()
        .withMessage("Token must be a string")
        .isLength({ min: 10 })
        .withMessage("Invalid token"),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .isString()
        .withMessage("Password must be a string")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters")
        .matches(/[A-Z]/)
        .withMessage("Must contain at least one uppercase letter")
        .matches(/[0-9]/)
        .withMessage("Must contain at least one number"),
    exports.handleValidationErrors,
];
/**
 * =========================
 * CATEGORY VALIDATIONS
 * =========================
 */
exports.validateCreateCategory = [
    (0, express_validator_1.body)("name")
        .isString()
        .withMessage("Category name must be a string")
        .trim()
        .isLength({ min: 2 })
        .withMessage("Category name too short"),
    exports.handleValidationErrors,
];
exports.validateUpdateCategory = [
    (0, express_validator_1.body)("name")
        .isString()
        .withMessage("Category name must be a string")
        .trim()
        .isLength({ min: 2 })
        .withMessage("Category name too short"),
    exports.handleValidationErrors,
];
// For URL parameters validation
exports.validateIdParam = [
    (0, express_validator_1.param)("id")
        .isString()
        .withMessage("ID must be a string")
        .notEmpty()
        .withMessage("ID is required"),
    exports.handleValidationErrors,
];
// For query parameters validation
exports.validateQueryParams = [
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
exports.validateResendVerification = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Invalid email")
        .normalizeEmail(),
    exports.handleValidationErrors,
];
exports.validateVerifyResetOTP = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Valid email is required"),
    (0, express_validator_1.body)("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be 6 digits"),
    exports.handleValidationErrors,
];
exports.validateCreateOrder = [
    (0, express_validator_1.body)("address")
        .notEmpty()
        .withMessage("Address is required")
        .isString()
        .withMessage("Address must be a string"),
    (0, express_validator_1.body)("description")
        .notEmpty()
        .withMessage("Description is required")
        .isString()
        .withMessage("Description must be a string"),
    (0, express_validator_1.body)("categoryId")
        .notEmpty()
        .withMessage("Category ID is required")
        .isString()
        .withMessage("Category ID must be a string"),
    exports.handleValidationErrors,
];
