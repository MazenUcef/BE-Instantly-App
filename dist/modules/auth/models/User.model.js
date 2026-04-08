"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const auth_constants_1 = require("../../../shared/constants/auth.constants");
const UserBiometricSchema = new mongoose_1.Schema({
    deviceId: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: Object.values(auth_constants_1.BIOMETRIC_TYPES),
        required: true,
    },
    passcodeHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const UserSchema = new mongoose_1.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: Object.values(auth_constants_1.AUTH_ROLES),
        default: auth_constants_1.AUTH_ROLES.CUSTOMER,
        index: true,
    },
    categoryId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Category",
        default: null,
        index: true,
    },
    address: {
        type: String,
        required: true,
        trim: true,
    },
    governmentIds: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Government",
        },
    ],
    profilePicture: {
        type: String,
        default: null,
        required: true,
    },
    isEmailVerified: { type: Boolean, default: false, index: true },
    isPhoneVerified: { type: Boolean, default: false },
    isProfileComplete: { type: Boolean, default: false, index: true },
    biometrics: {
        type: [UserBiometricSchema],
        default: [],
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalReviews: {
        type: Number,
        default: 0,
        min: 0,
    },
    jobTitles: {
        type: [String],
        default: [],
    },
}, {
    timestamps: true,
    versionKey: false,
});
UserSchema.index({ governmentIds: 1, role: 1 });
UserSchema.index({ role: 1, categoryId: 1 });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true });
UserSchema.index({ "biometrics.deviceId": 1 });
exports.default = mongoose_1.default.model("User", UserSchema);
