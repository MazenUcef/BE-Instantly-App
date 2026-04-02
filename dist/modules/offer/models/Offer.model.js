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
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const OfferSchema = new mongoose_1.Schema({
    orderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
    },
    supplierId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    timeRange: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
    },
    timeToStart: {
        type: Date,
        default: null,
    },
    status: {
        type: String,
        enum: Object.values(offer_constants_1.OFFER_STATUS),
        default: offer_constants_1.OFFER_STATUS.PENDING,
        index: true,
    },
    expiresAt: {
        type: Date,
        default: null,
        index: true,
    },
    acceptedAt: {
        type: Date,
        default: null,
    },
    rejectedAt: {
        type: Date,
        default: null,
    },
    withdrawnAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
OfferSchema.index({ orderId: 1, status: 1, createdAt: -1 });
OfferSchema.index({ supplierId: 1, status: 1, createdAt: -1 });
OfferSchema.index({ supplierId: 1, updatedAt: -1 });
OfferSchema.index({ expiresAt: 1 }, {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
});
OfferSchema.index({ orderId: 1, supplierId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: offer_constants_1.OFFER_STATUS.PENDING,
    },
    name: "uniq_supplier_pending_offer_per_order",
});
OfferSchema.index({ orderId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: offer_constants_1.OFFER_STATUS.ACCEPTED,
    },
    name: "uniq_order_single_accepted_offer",
});
OfferSchema.index({ supplierId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: offer_constants_1.OFFER_STATUS.ACCEPTED,
    },
    name: "uniq_supplier_single_active_accepted_offer",
});
exports.default = mongoose_1.default.model("Offer", OfferSchema);
