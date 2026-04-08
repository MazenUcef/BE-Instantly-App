"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResetToken = exports.verifyRefreshToken = exports.verifyToken = exports.generateRefreshToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateToken = (payload, expiresIn = '15m') => {
    const { exp, iat, ...rest } = payload;
    return jsonwebtoken_1.default.sign(rest, process.env.JWT_SECRET, { expiresIn });
};
exports.generateToken = generateToken;
const generateRefreshToken = (payload, expiresIn = '7d') => {
    const { exp, iat, ...rest } = payload;
    return jsonwebtoken_1.default.sign(rest, process.env.REFRESH_TOKEN_SECRET, { expiresIn });
};
exports.generateRefreshToken = generateRefreshToken;
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
};
exports.verifyToken = verifyToken;
const verifyRefreshToken = (token) => {
    return jsonwebtoken_1.default.verify(token, process.env.REFRESH_TOKEN_SECRET);
};
exports.verifyRefreshToken = verifyRefreshToken;
const generateResetToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
exports.generateResetToken = generateResetToken;
