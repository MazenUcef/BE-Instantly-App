"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/socket', (req, res) => {
    const io = req.app.get('io');
    io.emit('test_event', {
        message: 'Hello from server',
        time: new Date(),
    });
    res.json({ socket: 'event emitted' });
});
exports.default = router;
