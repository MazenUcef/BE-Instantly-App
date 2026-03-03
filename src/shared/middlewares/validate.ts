import { RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import upload from "../config/multer";

const handleValidationErrors: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

/**
 * =========================
 * REGISTER
 * =========================
 */
export const validateRegister: RequestHandler[] = [
  // Multer middleware first
  upload.fields([{ name: "profilePicture", maxCount: 1 }]),

  (req, res, next) => {
    const files = req.files as {
      profilePicture?: Express.Multer.File[];
    };

    if (!files?.profilePicture?.[0]) {
      return res.status(400).json({
        success: false,
        message: "profilePicture is required",
      });
    }
    next();
  },

  body("firstName")
    .notEmpty()
    .withMessage("First name is required")
    .isString()
    .withMessage("First name must be a string")
    .trim()
    .isLength({ min: 2 })
    .withMessage("First name too short"),

  body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .isString()
    .withMessage("Last name must be a string")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Last name too short"),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isString()
    .withMessage("Phone number must be a string")
    .trim()
    .isLength({ min: 10 })
    .withMessage("Invalid phone number"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 8 })
    .withMessage("Password too short")
    .matches(/[A-Z]/)
    .withMessage("Must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Must contain at least one number"),

  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .optional()
    .isIn(["customer", "supplier", "admin"])
    .withMessage("Invalid role")
    .default("supplier"),

  // body('categoryId')
  //   .notEmpty().withMessage('Category is required')
  //   .isString().withMessage('Category ID must be a string')
  //   .trim()
  //   .notEmpty().withMessage('Category required'),

  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .isString()
    .withMessage("Address must be a string")
    .trim()
    .isLength({ min: 5 })
    .withMessage("Address too short"),

  handleValidationErrors,
];

/**
 * =========================
 * VERIFY PHONE OTP
 * =========================
 */
export const validateVerifyPhoneOTP: RequestHandler[] = [
  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isString()
    .withMessage("Phone number must be a string")
    .trim()
    .isLength({ min: 10 })
    .withMessage("Invalid phone number"),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .isString()
    .withMessage("OTP must be a string")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers"),

  handleValidationErrors,
];

/**
 * =========================
 * VERIFY EMAIL OTP
 * =========================
 */
export const validateVerifyEmailOTP: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .isString()
    .withMessage("OTP must be a string")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers"),

  handleValidationErrors,
];

/**
 * =========================
 * LOGIN
 * =========================
 */
export const validateLogin: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isString()
    .withMessage("Password must be a string")
    .notEmpty()
    .withMessage("Password required"),

  handleValidationErrors,
];

/**
 * =========================
 * REFRESH TOKEN
 * =========================
 */
export const validateRefreshToken: RequestHandler[] = [
  body("refreshToken")
    .isString()
    .withMessage("Refresh token must be a string")
    .isLength({ min: 10 })
    .withMessage("Invalid refresh token"),

  handleValidationErrors,
];

/**
 * =========================
 * FORGOT PASSWORD
 * =========================
 */
export const validateForgotPassword: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  handleValidationErrors,
];

/**
 * =========================
 * RESET PASSWORD
 * =========================
 */
export const validateResetPassword: RequestHandler[] = [
  body("token")
    .isString()
    .withMessage("Token must be a string")
    .isLength({ min: 10 })
    .withMessage("Invalid token"),

  body("password")
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

  handleValidationErrors,
];

/**
 * =========================
 * CATEGORY VALIDATIONS
 * =========================
 */
export const validateCreateCategory: RequestHandler[] = [
  body("name")
    .isString()
    .withMessage("Category name must be a string")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Category name too short"),

  handleValidationErrors,
];

export const validateUpdateCategory: RequestHandler[] = [
  body("name")
    .isString()
    .withMessage("Category name must be a string")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Category name too short"),

  handleValidationErrors,
];

// For URL parameters validation
export const validateIdParam: RequestHandler[] = [
  param("id")
    .isString()
    .withMessage("ID must be a string")
    .notEmpty()
    .withMessage("ID is required"),

  handleValidationErrors,
];

// For query parameters validation
export const validateQueryParams: RequestHandler[] = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  handleValidationErrors,
];

export const validateResendVerification: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  handleValidationErrors,
];

export const validateVerifyResetOTP = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Valid email is required"),
  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
  handleValidationErrors,
];
