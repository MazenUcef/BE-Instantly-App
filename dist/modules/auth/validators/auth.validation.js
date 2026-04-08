"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRemoveDevice = exports.validateBiometricLogin = exports.validateRegisterDevice = exports.validateDeleteUser = exports.validateUpdateUser = exports.validateGetUserById = exports.validateChangePassword = exports.validateSwitchRole = exports.validateResetPassword = exports.validateVerifyResetOTP = exports.validateForgotPassword = exports.validateRefreshToken = exports.validateLogin = exports.validateResendVerificationEmail = exports.validateVerifyEmailOTP = exports.validateRegister = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const multer_1 = __importDefault(require("../../../shared/config/multer"));
const auth_constants_1 = require("../../../shared/constants/auth.constants");
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
const egyptPhoneRegex = /^01[0-9]{9}$/;
const nameRegex = /^[a-zA-Z\u0600-\u06FF\s]+$/;
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
        .bail()
        .isString()
        .withMessage("First name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("First name must be between 2 and 50 characters")
        .bail()
        .matches(nameRegex)
        .withMessage("First name can only contain letters and spaces"),
    (0, express_validator_1.body)("lastName")
        .notEmpty()
        .withMessage("Last name is required")
        .bail()
        .isString()
        .withMessage("Last name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Last name must be between 2 and 50 characters")
        .bail()
        .matches(nameRegex)
        .withMessage("Last name can only contain letters and spaces"),
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email format")
        .bail()
        .normalizeEmail()
        .isLength({ max: 100 })
        .withMessage("Email is too long"),
    (0, express_validator_1.body)("phoneNumber")
        .notEmpty()
        .withMessage("Phone number is required")
        .bail()
        .isString()
        .withMessage("Phone number must be a string")
        .bail()
        .trim()
        .matches(egyptPhoneRegex)
        .withMessage("Phone number must be a valid Egyptian mobile number starting with 01"),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .bail()
        .isString()
        .withMessage("Password must be a string")
        .bail()
        .isLength({ min: 8, max: 100 })
        .withMessage("Password must be between 8 and 100 characters")
        .bail()
        .matches(/[A-Z]/)
        .withMessage("Password must contain at least one uppercase letter")
        .bail()
        .matches(/[a-z]/)
        .withMessage("Password must contain at least one lowercase letter")
        .bail()
        .matches(/[0-9]/)
        .withMessage("Password must contain at least one number")
        .bail()
        .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
        .withMessage("Password must contain at least one special character"),
    (0, express_validator_1.body)("address")
        .notEmpty()
        .withMessage("Address is required")
        .bail()
        .isString()
        .withMessage("Address must be a string")
        .bail()
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be between 5 and 200 characters"),
    (0, express_validator_1.body)("role")
        .notEmpty()
        .withMessage("Role is required")
        .isIn([auth_constants_1.AUTH_ROLES.CUSTOMER, auth_constants_1.AUTH_ROLES.SUPPLIER])
        .withMessage("Role must be either customer or supplier"),
    (0, express_validator_1.body)("categoryId")
        .if((0, express_validator_1.body)("role").equals(auth_constants_1.AUTH_ROLES.SUPPLIER))
        .notEmpty()
        .withMessage("Category is required for supplier")
        .bail()
        .isMongoId()
        .withMessage("Invalid category ID"),
    (0, express_validator_1.body)("jobTitles")
        .if((0, express_validator_1.body)("role").equals(auth_constants_1.AUTH_ROLES.SUPPLIER))
        .isArray({ min: 1 })
        .withMessage("At least one job title is required for supplier"),
    (0, express_validator_1.body)("jobTitles.*")
        .if((0, express_validator_1.body)("role").equals(auth_constants_1.AUTH_ROLES.SUPPLIER))
        .isString()
        .withMessage("Each job title must be a string")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("Job title cannot be empty")
        .bail()
        .isLength({ min: 2, max: 50 })
        .withMessage("Job title must be between 2 and 50 characters"),
    (0, express_validator_1.body)("governmentIds")
        .if((0, express_validator_1.body)("role").equals(auth_constants_1.AUTH_ROLES.SUPPLIER))
        .isArray({ min: 1 })
        .withMessage("At least one government/service area is required for supplier"),
    (0, express_validator_1.body)("governmentIds.*")
        .if((0, express_validator_1.body)("role").equals(auth_constants_1.AUTH_ROLES.SUPPLIER))
        .isMongoId()
        .withMessage("Each government ID must be a valid Mongo ID"),
    exports.handleValidationErrors,
];
exports.validateVerifyEmailOTP = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email")
        .bail()
        .normalizeEmail(),
    (0, express_validator_1.body)("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .bail()
        .isString()
        .withMessage("OTP must be a string")
        .bail()
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be exactly 6 digits")
        .bail()
        .isNumeric()
        .withMessage("OTP must contain only numbers"),
    exports.handleValidationErrors,
];
exports.validateResendVerificationEmail = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email")
        .bail()
        .normalizeEmail(),
    exports.handleValidationErrors,
];
exports.validateLogin = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email")
        .bail()
        .normalizeEmail(),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .bail()
        .isString()
        .withMessage("Password must be a string"),
    exports.handleValidationErrors,
];
exports.validateRefreshToken = [
    (0, express_validator_1.body)("refreshToken")
        .notEmpty()
        .withMessage("Refresh token is required")
        .bail()
        .isString()
        .withMessage("Refresh token must be a string")
        .bail()
        .isLength({ min: 10 })
        .withMessage("Invalid refresh token"),
    exports.handleValidationErrors,
];
exports.validateForgotPassword = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email")
        .bail()
        .normalizeEmail(),
    exports.handleValidationErrors,
];
exports.validateVerifyResetOTP = [
    (0, express_validator_1.body)("email")
        .notEmpty()
        .withMessage("Email is required")
        .bail()
        .isEmail()
        .withMessage("Invalid email")
        .bail()
        .normalizeEmail(),
    (0, express_validator_1.body)("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .bail()
        .isString()
        .withMessage("OTP must be a string")
        .bail()
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be exactly 6 digits")
        .bail()
        .isNumeric()
        .withMessage("OTP must contain only numbers"),
    exports.handleValidationErrors,
];
exports.validateResetPassword = [
    (0, express_validator_1.body)("token")
        .notEmpty()
        .withMessage("Token is required")
        .bail()
        .isString()
        .withMessage("Token must be a string")
        .bail()
        .isLength({ min: 10 })
        .withMessage("Invalid token"),
    (0, express_validator_1.body)("password")
        .notEmpty()
        .withMessage("Password is required")
        .bail()
        .isString()
        .withMessage("Password must be a string")
        .bail()
        .isLength({ min: 8, max: 100 })
        .withMessage("Password must be between 8 and 100 characters")
        .bail()
        .matches(/[A-Z]/)
        .withMessage("Password must contain at least one uppercase letter")
        .bail()
        .matches(/[a-z]/)
        .withMessage("Password must contain at least one lowercase letter")
        .bail()
        .matches(/[0-9]/)
        .withMessage("Password must contain at least one number")
        .bail()
        .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
        .withMessage("Password must contain at least one special character"),
    exports.handleValidationErrors,
];
exports.validateSwitchRole = [
    (0, express_validator_1.body)("targetRole")
        .notEmpty()
        .withMessage("Target role is required")
        .bail()
        .isIn([auth_constants_1.AUTH_ROLES.CUSTOMER, auth_constants_1.AUTH_ROLES.SUPPLIER])
        .withMessage("Target role must be either customer or supplier"),
    (0, express_validator_1.body)("categoryId").optional().isMongoId().withMessage("Invalid category ID"),
    (0, express_validator_1.body)("jobs").optional().isArray().withMessage("Jobs must be an array"),
    (0, express_validator_1.body)("jobs.*")
        .optional()
        .isString()
        .withMessage("Each job must be a string")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("Job cannot be empty")
        .bail()
        .isLength({ min: 2, max: 50 })
        .withMessage("Job must be between 2 and 50 characters"),
    (0, express_validator_1.body)("governmentIds")
        .optional()
        .isArray()
        .withMessage("Government IDs must be an array"),
    (0, express_validator_1.body)("governmentIds.*")
        .optional()
        .isMongoId()
        .withMessage("Each government ID must be a valid Mongo ID"),
    exports.handleValidationErrors,
];
exports.validateChangePassword = [
    (0, express_validator_1.body)("currentPassword")
        .notEmpty()
        .withMessage("Current password is required")
        .bail()
        .isString()
        .withMessage("Current password must be a string"),
    (0, express_validator_1.body)("newPassword")
        .notEmpty()
        .withMessage("New password is required")
        .bail()
        .isString()
        .withMessage("New password must be a string")
        .bail()
        .isLength({ min: 8, max: 100 })
        .withMessage("New password must be between 8 and 100 characters")
        .bail()
        .matches(/[A-Z]/)
        .withMessage("New password must contain at least one uppercase letter")
        .bail()
        .matches(/[a-z]/)
        .withMessage("New password must contain at least one lowercase letter")
        .bail()
        .matches(/[0-9]/)
        .withMessage("New password must contain at least one number")
        .bail()
        .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
        .withMessage("New password must contain at least one special character"),
    exports.handleValidationErrors,
];
exports.validateGetUserById = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid user ID"),
    exports.handleValidationErrors,
];
exports.validateUpdateUser = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid user ID"),
    (0, express_validator_1.body)("firstName")
        .optional()
        .isString()
        .withMessage("First name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("First name must be between 2 and 50 characters")
        .bail()
        .matches(nameRegex)
        .withMessage("First name can only contain letters and spaces"),
    (0, express_validator_1.body)("lastName")
        .optional()
        .isString()
        .withMessage("Last name must be a string")
        .bail()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Last name must be between 2 and 50 characters")
        .bail()
        .matches(nameRegex)
        .withMessage("Last name can only contain letters and spaces"),
    (0, express_validator_1.body)("address")
        .optional()
        .isString()
        .withMessage("Address must be a string")
        .bail()
        .trim()
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be between 5 and 200 characters"),
    (0, express_validator_1.body)("phoneNumber")
        .optional()
        .isString()
        .withMessage("Phone number must be a string")
        .bail()
        .trim()
        .matches(egyptPhoneRegex)
        .withMessage("Phone number must be a valid Egyptian mobile number starting with 01"),
    (0, express_validator_1.body)("profilePicture")
        .optional()
        .isString()
        .withMessage("Profile picture must be a string")
        .bail()
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage("Profile picture URL is invalid"),
    (0, express_validator_1.body)([
        "role",
        "isEmailVerified",
        "isPhoneVerified",
        "isProfileComplete",
        "averageRating",
        "totalReviews",
        "governmentIds",
        "categoryId",
        "jobTitles",
        "biometrics",
        "password",
    ])
        .not()
        .exists()
        .withMessage("This field is not allowed to be updated from this endpoint"),
    exports.handleValidationErrors,
];
exports.validateDeleteUser = [
    (0, express_validator_1.param)("id").isMongoId().withMessage("Invalid user ID"),
    exports.handleValidationErrors,
];
exports.validateRegisterDevice = [
    (0, express_validator_1.body)("deviceId")
        .notEmpty()
        .withMessage("Device ID is required")
        .bail()
        .isString()
        .withMessage("Device ID must be a string")
        .bail()
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage("Device ID must be between 3 and 200 characters"),
    (0, express_validator_1.body)("type")
        .notEmpty()
        .withMessage("Biometric type is required")
        .bail()
        .isIn(Object.values(auth_constants_1.BIOMETRIC_TYPES))
        .withMessage("Invalid biometric type"),
    (0, express_validator_1.body)("passcode")
        .if((0, express_validator_1.body)("type").equals(auth_constants_1.BIOMETRIC_TYPES.PASSCODE))
        .notEmpty()
        .withMessage("Passcode is required for passcode login")
        .bail()
        .isString()
        .withMessage("Passcode must be a string")
        .bail()
        .isLength({ min: 4, max: 20 })
        .withMessage("Passcode must be between 4 and 20 characters"),
    exports.handleValidationErrors,
];
exports.validateBiometricLogin = [
    (0, express_validator_1.body)("deviceId")
        .notEmpty()
        .withMessage("Device ID is required")
        .bail()
        .isString()
        .withMessage("Device ID must be a string")
        .bail()
        .trim(),
    (0, express_validator_1.body)("type")
        .notEmpty()
        .withMessage("Biometric type is required")
        .bail()
        .isIn(Object.values(auth_constants_1.BIOMETRIC_TYPES))
        .withMessage("Invalid biometric type"),
    (0, express_validator_1.body)("passcode")
        .if((0, express_validator_1.body)("type").equals(auth_constants_1.BIOMETRIC_TYPES.PASSCODE))
        .notEmpty()
        .withMessage("Passcode is required for passcode login")
        .bail()
        .isString()
        .withMessage("Passcode must be a string"),
    exports.handleValidationErrors,
];
exports.validateRemoveDevice = [
    (0, express_validator_1.body)("deviceId")
        .notEmpty()
        .withMessage("Device ID is required")
        .bail()
        .isString()
        .withMessage("Device ID must be a string")
        .bail()
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage("Device ID must be between 3 and 200 characters"),
    exports.handleValidationErrors,
];
