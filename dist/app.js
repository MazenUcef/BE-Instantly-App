"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const morgan_1 = __importDefault(require("morgan"));
const database_1 = __importDefault(require("./shared/config/database"));
const socket_1 = require("./shared/config/socket");
const auth_routes_1 = __importDefault(require("./modules/auth/routes/auth.routes"));
const category_routes_1 = __importDefault(require("./modules/category/routes/category.routes"));
const chat_routes_1 = __importDefault(require("./modules/chat/routes/chat.routes"));
const Government_routes_1 = __importDefault(require("./modules/government/routes/Government.routes"));
const notifications_routes_1 = __importDefault(require("./modules/notification/routes/notifications.routes"));
const offer_routes_1 = __importDefault(require("./modules/offer/routes/offer.routes"));
const order_routes_1 = __importDefault(require("./modules/order/routes/order.routes"));
const review_routes_1 = __importDefault(require("./modules/review/routes/review.routes"));
const session_routes_1 = __importDefault(require("./modules/session/routes/session.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const server = (0, http_1.createServer)(app);
exports.server = server;
(0, socket_1.initSocket)(server);
(0, database_1.default)();
app.use((0, morgan_1.default)("dev"));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 100 : 1000,
});
app.use(limiter);
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get("/health", (req, res) => {
    res.status(200).json({
        message: "Server is running",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
    });
});
app.use("/api/auth", auth_routes_1.default);
app.use("/api/categories", category_routes_1.default);
app.use("/api/governments", Government_routes_1.default);
app.use("/api/chat", chat_routes_1.default);
app.use("/api/notifications", notifications_routes_1.default);
app.use("/api/offers", offer_routes_1.default);
app.use("/api/orders", order_routes_1.default);
app.use("/api/reviews", review_routes_1.default);
app.use("/api/sessions", session_routes_1.default);
app.use((err, req, res, next) => {
    if (res.headersSent)
        return next(err);
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || "Something went wrong!",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
});
