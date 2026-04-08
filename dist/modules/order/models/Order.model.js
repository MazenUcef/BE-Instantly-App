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
const order_constants_1 = require("../../../shared/constants/order.constants");
const orderSchema = new mongoose_1.Schema({
    customerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    customerName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
    },
    supplierId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    categoryId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
        index: true,
    },
    governmentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Government",
        required: true,
        index: true,
    },
    jobTitle: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
    },
    address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
    requestedPrice: {
        type: Number,
        required: true,
        min: 1,
    },
    orderType: {
        type: String,
        enum: Object.values(order_constants_1.ORDER_TYPE),
        required: true,
        default: order_constants_1.ORDER_TYPE.DAILY,
    },
    selectedWorkflow: {
        type: String,
        required: true,
        trim: true,
    },
    timeToStart: {
        type: Date,
        default: null,
    },
    status: {
        type: String,
        enum: Object.values(order_constants_1.ORDER_STATUS),
        default: order_constants_1.ORDER_STATUS.PENDING,
        index: true,
    },
    finalPrice: {
        type: Number,
        default: null,
        min: 0,
    },
    customerReviewed: {
        type: Boolean,
        default: false,
        index: true,
    },
    supplierReviewed: {
        type: Boolean,
        default: false,
        index: true,
    },
    cancelledBy: {
        type: String,
        enum: Object.values(order_constants_1.ORDER_CANCELLED_BY),
        default: null,
    },
    cancellationReason: {
        type: String,
        default: null,
        maxlength: 500,
    },
    cancelledAt: {
        type: Date,
        default: null,
    },
    completedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
orderSchema.index({ categoryId: 1, governmentId: 1, status: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ supplierId: 1, status: 1, updatedAt: -1 });
orderSchema.index({
    customerId: 1,
    customerReviewed: 1,
    status: 1,
    updatedAt: -1,
});
orderSchema.index({ customerId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: { $in: [order_constants_1.ORDER_STATUS.PENDING, order_constants_1.ORDER_STATUS.IN_PROGRESS] },
    },
    name: "uniq_customer_single_active_order",
});
exports.default = mongoose_1.default.model("Order", orderSchema);
