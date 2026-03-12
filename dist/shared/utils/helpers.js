"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFile = void 0;
const errorHandler_1 = require("../middlewares/errorHandler");
const validateFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        throw new errorHandler_1.AppError('Invalid file type', 400);
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new errorHandler_1.AppError('File too large', 400);
    }
};
exports.validateFile = validateFile;
