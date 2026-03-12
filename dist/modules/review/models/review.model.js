"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const ReviewSchema = new mongoose_1.Schema({
    reviewerId: {
        type: String,
        required: true,
    },
    targetUserId: {
        type: String,
        required: true,
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    comment: {
        type: String,
        required: true,
        trim: true,
    },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)("Review", ReviewSchema);
