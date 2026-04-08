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
const availability_constants_1 = require("../../../shared/constants/availability.constants");
const WeeklyScheduleSchema = new mongoose_1.Schema({
    dayOfWeek: {
        type: Number,
        required: true,
        min: 0,
        max: 6,
    },
    isWorking: {
        type: Boolean,
        default: false,
    },
    startTime: {
        type: String,
        default: null,
        trim: true,
    },
    endTime: {
        type: String,
        default: null,
        trim: true,
    },
    slotDurationMinutes: {
        type: Number,
        default: availability_constants_1.DEFAULT_SLOT_DURATION_MINUTES,
        enum: availability_constants_1.AVAILABILITY_ALLOWED_SLOT_DURATIONS,
    },
    breakStart: {
        type: String,
        default: null,
        trim: true,
    },
    breakEnd: {
        type: String,
        default: null,
        trim: true,
    },
}, { _id: false });
const BlockedDateSchema = new mongoose_1.Schema({
    date: {
        type: Date,
        required: true,
        index: true,
    },
    reason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 300,
    },
    isFullDay: {
        type: Boolean,
        default: true,
    },
    startTime: {
        type: String,
        default: null,
        trim: true,
    },
    endTime: {
        type: String,
        default: null,
        trim: true,
    },
}, { _id: true });
const SupplierAvailabilitySchema = new mongoose_1.Schema({
    supplierId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    timezone: {
        type: String,
        default: availability_constants_1.DEFAULT_AVAILABILITY_TIMEZONE,
        trim: true,
    },
    weeklySchedule: {
        type: [WeeklyScheduleSchema],
        default: () => [...availability_constants_1.DEFAULT_WEEKLY_SCHEDULE],
        validate: {
            validator(value) {
                const days = value.map((item) => item.dayOfWeek).sort((a, b) => a - b);
                return days.length === 7 && days.every((day, index) => day === index);
            },
            message: "weeklySchedule must contain exactly 7 unique days from 0 to 6",
        },
    },
    blockedDates: {
        type: [BlockedDateSchema],
        default: [],
    },
}, {
    timestamps: true,
    versionKey: false,
});
SupplierAvailabilitySchema.index({ supplierId: 1 });
SupplierAvailabilitySchema.index({ "blockedDates.date": 1 });
SupplierAvailabilitySchema.index({ supplierId: 1, updatedAt: -1 });
exports.default = mongoose_1.default.model("SupplierAvailability", SupplierAvailabilitySchema);
