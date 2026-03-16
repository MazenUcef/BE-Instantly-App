import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import upload from "../config/multer";

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
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

export const validateRegister: RequestHandler[] = [
  upload.fields([{ name: "profilePicture", maxCount: 1 }]),

  (req, res, next) => {
    const files = req.files as {
      profilePicture?: Express.Multer.File[];
    };

    if (!files?.profilePicture?.[0]) {
      return res.status(400).json({
        success: false,
        message: "Profile picture is required",
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
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
    .withMessage("First name can only contain letters and spaces"),

  body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .isString()
    .withMessage("Last name must be a string")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .matches(/^[a-zA-Z\u0600-\u06FF\s]+$/)
    .withMessage("Last name can only contain letters and spaces"),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage("Email is too long"),

  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isString()
    .withMessage("Phone number must be a string")
    .trim()
    .matches(/^01[0-9]{9}$/)
    .withMessage(
      "Phone number must be a valid Egyptian number (11 digits starting with 01)",
    ),

  body("password")
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

  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .isString()
    .withMessage("Address must be a string")
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be between 5 and 200 characters"),

  body("role")
    .optional()
    .isIn(["customer", "supplier"])
    .withMessage("Role must be either customer or supplier")
    .default("customer"),

  body("categoryId")
    .if(body("role").equals("supplier"))
    .notEmpty()
    .withMessage("Category is required for supplier")
    .isString()
    .withMessage("Category ID must be a string")
    .trim()
    .isMongoId()
    .withMessage("Invalid category ID format"),

  body("jobTitles")
    .if(body("role").equals("supplier"))
    .notEmpty()
    .withMessage("Job titles are required for supplier")
    .isArray()
    .withMessage("Job titles must be an array")
    .custom((value: any) => value.length > 0)
    .withMessage("At least one job title is required")
    .custom((value: any) => value.every((item: any) => typeof item === "string"))
    .withMessage("All job titles must be strings"),

  body("jobTitles.*")
    .if(body("role").equals("supplier"))
    .isString()
    .withMessage("Each job title must be a string")
    .trim()
    .notEmpty()
    .withMessage("Job title cannot be empty")
    .isLength({ min: 2, max: 50 })
    .withMessage("Job title must be between 2 and 50 characters"),

  body("governmentIds")
    .if(body("role").equals("supplier"))
    .notEmpty()
    .withMessage("Government/service areas are required for supplier")
    .isArray()
    .withMessage("Government IDs must be an array")
    .custom((value: any) => value.length > 0)
    .withMessage("At least one government/service area is required")
    .custom((value: any) => value.every((item: any) => typeof item === "string"))
    .withMessage("All government IDs must be strings"),

  body("governmentIds.*")
    .if(body("role").equals("supplier"))
    .isString()
    .withMessage("Each government ID must be a string")
    .trim()
    .notEmpty()
    .withMessage("Government ID cannot be empty")
    .isMongoId()
    .withMessage("Invalid government ID format"),

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

export const validateCreateOrder: RequestHandler[] = [
  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .isString()
    .withMessage("Address must be a string"),

  body("description")
    .notEmpty()
    .withMessage("Description is required")
    .isString()
    .withMessage("Description must be a string"),

  body("categoryId")
    .notEmpty()
    .withMessage("Category ID is required")
    .isString()
    .withMessage("Category ID must be a string"),

  handleValidationErrors,
];

