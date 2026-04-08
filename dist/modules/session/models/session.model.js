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
const session_constants_1 = require("../../../shared/constants/session.constants");
const JobSessionSchema = new mongoose_1.Schema({
    orderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
    },
    offerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Offer",
        required: true,
        index: true,
    },
    customerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    supplierId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    paymentConfirmed: {
        type: Boolean,
        default: false,
        index: true,
    },
    paymentConfirmedAt: {
        type: Date,
        default: null,
    },
    status: {
        type: String,
        enum: Object.values(session_constants_1.SESSION_STATUS),
        default: session_constants_1.SESSION_STATUS.STARTED,
        index: true,
    },
    cancelledBy: {
        type: String,
        enum: Object.values(session_constants_1.SESSION_CANCELLED_BY),
        default: null,
    },
    cancellationReason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500,
    },
    startedAt: {
        type: Date,
        default: () => new Date(),
    },
    onTheWayAt: {
        type: Date,
        default: null,
    },
    arrivedAt: {
        type: Date,
        default: null,
    },
    workStartedAt: {
        type: Date,
        default: null,
    },
    completedAt: {
        type: Date,
        default: null,
    },
    cancelledAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
JobSessionSchema.index({ orderId: 1 }, { unique: true });
JobSessionSchema.index({ offerId: 1 }, { unique: true });
JobSessionSchema.index({ customerId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ supplierId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ status: 1, updatedAt: -1 });
JobSessionSchema.index({ customerId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: { $in: [...session_constants_1.SESSION_ACTIVE_STATUSES] },
    },
    name: "uniq_customer_single_active_session",
});
JobSessionSchema.index({ supplierId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: { $in: [...session_constants_1.SESSION_ACTIVE_STATUSES] },
    },
    name: "uniq_supplier_single_active_session",
});
exports.default = mongoose_1.default.model("JobSession", JobSessionSchema);
