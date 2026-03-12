"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionByOrder = exports.completeSession = exports.updateSessionStatus = exports.getActiveSessionForUser = exports.getSessionById = exports.createSession = void 0;
const session_model_1 = __importDefault(require("../models/session.model"));
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const Offer_model_1 = __importDefault(require("../../offer/models/Offer.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const populateSessionData = async (session) => {
    if (!session)
        return null;
    const sessionObj = session.toObject ? session.toObject() : session;
    try {
        const [order, offer, customer, supplier] = await Promise.all([
            Order_model_1.default.findById(session.orderId)
                .populate('categoryId', 'name icon')
                .populate('governmentId', 'name nameAr')
                .lean(),
            Offer_model_1.default.findById(session.offerId).lean(),
            User_model_1.default.findById(session.customerId)
                .select("-password -refreshToken -biometrics")
                .lean(),
            User_model_1.default.findById(session.supplierId)
                .select("-password -refreshToken -biometrics")
                .lean(),
        ]);
        return {
            ...sessionObj,
            order: order || null,
            offer: offer || null,
            customer: customer || null,
            supplier: supplier || null,
        };
    }
    catch (error) {
        console.error("Error populating session data:", error);
        return sessionObj;
    }
};
const createSession = async (req, res) => {
    try {
        const { orderId, offerId, customerId, supplierId } = req.body;
        const existing = await session_model_1.default.findOne({
            $or: [
                { customerId, status: { $nin: ["completed", "cancelled"] } },
                { supplierId, status: { $nin: ["completed", "cancelled"] } },
            ],
        });
        if (existing) {
            return res.status(400).json({
                message: "Active session already exists",
                session: existing,
            });
        }
        const session = await session_model_1.default.create({
            orderId,
            offerId,
            customerId,
            supplierId,
            status: "started",
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: customerId,
            type: "SESSION_CREATED",
            title: "New Job Started",
            message: `A new Job for order #${orderId} has been started.`,
            data: { sessionId: session._id, orderId, offerId, supplierId },
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: supplierId,
            type: "SESSION_CREATED",
            title: "New Job Assigned",
            message: `You have been assigned a job for order #${orderId}.`,
            data: { sessionId: session._id, orderId, offerId, customerId },
        });
        res.status(201).json(session);
    }
    catch (error) {
        console.error("Create session error:", error);
        res.status(500).json({ message: "Failed to create session" });
    }
};
exports.createSession = createSession;
const getSessionById = async (req, res) => {
    try {
        const session = await session_model_1.default.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        const populatedSession = await populateSessionData(session);
        res.json(populatedSession);
    }
    catch (error) {
        console.error("Get session by ID error:", error);
        res.status(500).json({ message: "Failed to fetch session" });
    }
};
exports.getSessionById = getSessionById;
const getActiveSessionForUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const session = await session_model_1.default.findOne({
            $or: [{ customerId: userId }, { supplierId: userId }],
            status: { $nin: ["completed", "cancelled"] },
        });
        console.log("session", session);
        if (!session) {
            return res.json({ active: false });
        }
        const populatedSession = await populateSessionData(session);
        res.json({
            active: true,
            session: populatedSession,
        });
    }
    catch (error) {
        console.error("Get active session error:", error);
        res.status(500).json({ message: "Failed to fetch active session" });
    }
};
exports.getActiveSessionForUser = getActiveSessionForUser;
const updateSessionStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowedStatuses = [
            "on_the_way",
            "arrived",
            "work_started",
            "completed",
            "cancelled",
        ];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        const session = await session_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        const populatedSession = await populateSessionData(session);
        const io = (0, socket_1.getIO)();
        io.to(`user_${session.customerId}`).emit("supplier_status_update", {
            sessionId: session._id,
            status,
            session: populatedSession,
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: session.customerId.toString(),
            type: "SUPPLIER_STATUS_UPDATE",
            title: "Supplier Status Update",
            message: `Your supplier updated the session to "${status}" for order #${session.orderId}.`,
            data: {
                sessionId: session._id,
                orderId: session.orderId,
                supplierId: session.supplierId,
                status,
                session: populatedSession,
            },
        });
        res.json({
            message: `Session status updated to "${status}"`,
            session: populatedSession,
        });
    }
    catch (error) {
        console.error("Update session status error:", error);
        res.status(500).json({ message: "Failed to update session" });
    }
};
exports.updateSessionStatus = updateSessionStatus;
const completeSession = async (req, res) => {
    try {
        const session = await session_model_1.default.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if (session.status === "completed") {
            return res.status(400).json({ message: "Already completed" });
        }
        session.status = "completed";
        session.completedAt = new Date();
        await session.save();
        const order = await Order_model_1.default.findByIdAndUpdate(session.orderId, { status: "completed" }, { new: true });
        const offer = await Offer_model_1.default.findById(session.offerId);
        const [customer, supplier] = await Promise.all([
            User_model_1.default.findById(session.customerId).select("-password"),
            User_model_1.default.findById(session.supplierId).select("-password"),
        ]);
        const io = (0, socket_1.getIO)();
        io.to(`user_${session.customerId}`).emit("job_completed", {
            sessionId: session._id,
        });
        io.to(`user_${session.supplierId}`).emit("job_completed", {
            sessionId: session._id,
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: session.customerId.toString(),
            type: "SESSION_COMPLETED",
            title: "Job Completed",
            message: `Your job for order #${session.orderId} has been completed.`,
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: session.supplierId.toString(),
            type: "SESSION_COMPLETED",
            title: "Job Completed",
            message: `You have completed the Job for order #${session.orderId}.`,
        });
        res.json({
            message: "Session completed successfully",
            session: {
                ...session.toObject(),
                order,
                offer,
                customer,
                supplier,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to complete session" });
    }
};
exports.completeSession = completeSession;
const getSessionByOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const session = await session_model_1.default.findOne({ orderId });
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        const populatedSession = await populateSessionData(session);
        res.json(populatedSession);
    }
    catch (error) {
        console.error("Get session by order error:", error);
        res.status(500).json({ message: "Failed to fetch session" });
    }
};
exports.getSessionByOrder = getSessionByOrder;
