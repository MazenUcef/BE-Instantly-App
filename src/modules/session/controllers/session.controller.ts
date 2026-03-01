import { Request, Response } from "express";
import JobSession from "../models/session.model";

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
      status: "accepted",
    });
    const token = req.headers.authorization;
    await sendNotification(token, {
      userId: customerId,
      type: "SESSION_CREATED",
      title: "New Job Started",
      message: `A new Job for order #${orderId} has been started.`,
      data: { sessionId: session._id, orderId, offerId, supplierId },
    });

    await sendNotification(token, {
      userId: supplierId,
      type: "SESSION_CREATED",
      title: "New Job Assigned",
      message: `You have been assigned a job for order #${orderId}.`,
      data: { sessionId: session._id, orderId, offerId, customerId },
    });

    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ message: "Failed to create session" });
  }
};

export const getSessionById = async (req: Request, res: Response) => {
  try {
    const session = await JobSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json(session);
  } catch (error) {
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

    if (!session) {
      return res.json({ active: false });
    }
    const token = req.headers.authorization;
    const [orderRes, customerRes, supplierRes] = await Promise.all([
      axios.get(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${session.orderId}`,
        {
          headers: {
            Authorization: token,
          },
        },
      ),
      axios.get(
        `${process.env.AUTH_SERVICE_URL}/api/auth/${session.customerId}`,
        {
          headers: {
            Authorization: token,
          },
        },
      ),
      axios.get(
        `${process.env.AUTH_SERVICE_URL}/api/auth/${session.supplierId}`,
        {
          headers: {
            Authorization: token,
          },
        },
      ),
    ]);

    res.json({
      active: true,
      session: {
        ...session.toObject(),
        order: orderRes.data,
        customer: customerRes.data,
        supplier: supplierRes.data,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch active session" });
  }
};

export const updateSessionStatus = async (req: any, res: Response) => {
  try {
    const { status } = req.body;
    const token = req.headers.authorization;

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

    const io = getIO();

    // 🔥 Emit real-time update to customer
    io.to(`user_${session.customerId}`).emit("supplier_status_update", {
      sessionId: session._id,
      status,
    });

    // 🔥 Notify customer through Notification Service
    await sendNotification(token, {
      userId: session.customerId.toString(),
      type: "SUPPLIER_STATUS_UPDATE",
      title: "Supplier Status Update",
      message: `Your supplier has updated the session status to "${status}" for order #${session.orderId}.`,
      data: {
        sessionId: session._id,
        orderId: session.orderId,
        supplierId: session.supplierId,
        status,
      },
    });

    res.json({
      message: `Session status updated to "${status}"`,
      session,
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

    const token = req.headers.authorization;

    session.status = "completed";
    session.completedAt = new Date();
    await session.save();

    await axios.put(
      `${process.env.ORDER_SERVICE_URL}/api/orders/${session.orderId}/status`,
      { status: "completed" },
      { headers: { Authorization: token } },
    );

    const [orderRes, offerRes, customerRes, supplierRes] = await Promise.all([
      axios.get(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${session.orderId}`,
        { headers: { Authorization: token } },
      ),
      axios.get(
        `${process.env.OFFER_SERVICE_URL}/api/offers/${session.offerId}`,
        { headers: { Authorization: token } },
      ),
      axios.get(
        `${process.env.AUTH_SERVICE_URL}/api/auth/${session.customerId}`,
        { headers: { Authorization: token } },
      ),
      axios.get(
        `${process.env.AUTH_SERVICE_URL}/api/auth/${session.supplierId}`,
        { headers: { Authorization: token } },
      ),
    ]);

    const io = getIO();

    io.to(`user_${session.customerId}`).emit("job_completed", {
      sessionId: session._id,
    });

    io.to(`user_${session.supplierId}`).emit("job_completed", {
      sessionId: session._id,
    });

    await sendNotification(token, {
      userId: session.customerId.toString(),
      type: "SESSION_COMPLETED",
      title: "Job Completed",
      message: `Your job for order #${session.orderId} has been completed.`,
      data: { sessionId: session._id, orderId: session.orderId, supplierId: session.supplierId },
    });

    await sendNotification(token, {
      userId: session.supplierId.toString(),
      type: "SESSION_COMPLETED",
      title: "Job Completed",
      message: `You have completed the Job for order #${session.orderId}.`,
      data: { sessionId: session._id, orderId: session.orderId, customerId: session.customerId },
    });

    res.json({
      message: "Session completed successfully",
      session: {
        ...session.toObject(),
        order: orderRes.data,
        offer: offerRes.data,
        customer: customerRes.data,
        supplier: supplierRes.data,
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

    res.json(session);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch session" });
  }
};
