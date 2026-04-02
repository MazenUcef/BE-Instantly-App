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
const call_constants_1 = require("../../../shared/constants/call.constants");
const CallSessionSchema = new mongoose_1.Schema({
    sessionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "JobSession",
        required: true,
        index: true,
    },
    callerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    receiverId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: Object.values(call_constants_1.CALL_TYPE),
        default: call_constants_1.CALL_TYPE.AUDIO,
        required: true,
    },
    status: {
        type: String,
        enum: Object.values(call_constants_1.CALL_STATUS),
        default: call_constants_1.CALL_STATUS.INITIATED,
        required: true,
        index: true,
    },
    startedAt: {
        type: Date,
        default: null,
    },
    answeredAt: {
        type: Date,
        default: null,
    },
    endedAt: {
        type: Date,
        default: null,
    },
    endReason: {
        type: String,
        enum: [...Object.values(call_constants_1.CALL_END_REASON), null],
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
CallSessionSchema.index({ sessionId: 1, status: 1 });
CallSessionSchema.index({ callerId: 1, createdAt: -1 });
CallSessionSchema.index({ receiverId: 1, createdAt: -1 });
CallSessionSchema.index({ sessionId: 1, createdAt: -1 });
// Optional stronger protection: only one active call per session
CallSessionSchema.index({ sessionId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: {
        status: { $in: ["initiated", "ringing", "accepted"] },
    },
    name: "uniq_active_call_per_session",
});
exports.default = mongoose_1.default.model("CallSession", CallSessionSchema);
