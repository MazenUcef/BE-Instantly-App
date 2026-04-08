"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chat_controller_1 = require("../controllers/chat.controller");
const auth_1 = require("../../../shared/middlewares/auth");
const chat_validation_1 = require("../validators/chat.validation");
const router = express_1.default.Router();
router.post("/", auth_1.authenticate, chat_validation_1.validateSendMessage, chat_controller_1.sendMessage);
router.get("/:sessionId", auth_1.authenticate, chat_validation_1.validateGetMessagesBySession, chat_controller_1.getMessagesBySession);
router.patch("/:sessionId/read", auth_1.authenticate, chat_validation_1.validateMarkMessagesAsRead, chat_controller_1.markMessagesAsRead);
exports.default = router;
