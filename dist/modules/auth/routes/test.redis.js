"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const redis_1 = __importDefault(require("../../../shared/config/redis"));
const router = (0, express_1.Router)();
router.get('/redis', async (req, res) => {
    await redis_1.default.set('test:key', 'hello redis', 'EX', 30);
    const value = await redis_1.default.get('test:key');
    res.json({
        status: 'ok',
        value
    });
});
exports.default = router;
