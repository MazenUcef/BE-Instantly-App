import { Request, Response } from "express";
import JobSession from "../models/session.model";
import Order from "../../order/models/Order.model";
import Offer from "../../offer/models/Offer.model";
import UserModel from "../../auth/models/User.model";
import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";

const populateSessionData = async (session: any) => {
  if (!session) return null;

  const sessionObj = session.toObject ? session.toObject() : session;

  try {
    const [order, offer, customer, supplier] = await Promise.all([
      Order.findById(session.orderId)
        .populate("categoryId", "name icon")
        .populate("governmentId", "name nameAr")
        .lean(),
      Offer.findById(session.offerId).lean(),
      UserModel.findById(session.customerId)
        .select("-password -refreshToken -biometrics")
        .lean(),
      UserModel.findById(session.supplierId)
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
  } catch (error) {
    console.error("Error populating session data:", error);
    return sessionObj;
  }
};

export const createSession = async (req: Request, res: Response) => {
  try {
    const { orderId, offerId, customerId, supplierId } = req.body;

    const existing = await JobSession.findOne({
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

    const session = await JobSession.create({
      orderId,
      offerId,
      customerId,
      supplierId,
      status: "started",
    });

    await publishNotification({
      userId: customerId,
      type: "SESSION_CREATED",
      title: "New Job Started",
      message: `A new Job for order #${orderId} has been started.`,
      data: { sessionId: session._id, orderId, offerId, supplierId },
    });

    await publishNotification({
      userId: supplierId,
      type: "SESSION_CREATED",
      title: "New Job Assigned",
      message: `You have been assigned a job for order #${orderId}.`,
      data: { sessionId: session._id, orderId, offerId, customerId },
    });

    res.status(201).json(session);
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ message: "Failed to create session" });
  }
};

export const getSessionById = async (req: Request, res: Response) => {
  try {
    const session = await JobSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    const populatedSession = await populateSessionData(session);

    res.json(populatedSession);
  } catch (error) {
    console.error("Get session by ID error:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
};

export const getActiveSessionForUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const session = await JobSession.findOne({
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
  } catch (error) {
    console.error("Get active session error:", error);
    res.status(500).json({ message: "Failed to fetch active session" });
  }
};

export const updateSessionStatus = async (req: any, res: Response) => {
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

    const session = await JobSession.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const populatedSession = await populateSessionData(session);

    const io = getIO();

    io.to(socketRooms.chat(session._id.toString())).emit(
      socketEvents.SESSION_STATUS_UPDATED,
      {
        sessionId: session._id.toString(),
        status,
        session: populatedSession,
      },
    );

    io.to(socketRooms.user(session.customerId.toString())).emit(
      socketEvents.SESSION_STATUS_UPDATED,
      {
        sessionId: session._id.toString(),
        status,
        session: populatedSession,
      },
    );

    io.to(socketRooms.user(session.supplierId.toString())).emit(
      socketEvents.SESSION_STATUS_UPDATED,
      {
        sessionId: session._id.toString(),
        status,
        session: populatedSession,
      },
    );

    await publishNotification({
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
  } catch (error) {
    console.error("Update session status error:", error);
    res.status(500).json({ message: "Failed to update session" });
  }
};

export const completeSession = async (req: Request, res: Response) => {
  try {
    const session = await JobSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.status === "completed") {
      return res.status(400).json({ message: "Already completed" });
    }

    session.status = "completed";
    session.completedAt = new Date();
    await session.save();

    const order = await Order.findByIdAndUpdate(
      session.orderId,
      { status: "completed" },
      { new: true },
    );

    const offer = await Offer.findById(session.offerId);

    const [customer, supplier] = await Promise.all([
      UserModel.findById(session.customerId).select("-password"),
      UserModel.findById(session.supplierId).select("-password"),
    ]);

    const io = getIO();

    io.to(`user_${session.customerId}`).emit("job_completed", {
      sessionId: session._id,
    });

    io.to(`user_${session.supplierId}`).emit("job_completed", {
      sessionId: session._id,
    });

    await publishNotification({
      userId: session.customerId.toString(),
      type: "SESSION_COMPLETED",
      title: "Job Completed",
      message: `Your job for order #${session.orderId} has been completed.`,
    });

    await publishNotification({
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
  } catch (error) {
    res.status(500).json({ message: "Failed to complete session" });
  }
};

export const getSessionByOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const session = await JobSession.findOne({ orderId });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const populatedSession = await populateSessionData(session);

    res.json(populatedSession);
  } catch (error) {
    console.error("Get session by order error:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
};
