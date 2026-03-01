import { Request, Response } from "express";
import Offer from "../models/Offer.model";

export const createOffer = async (req: any, res: Response) => {
  try {
    const { orderId, type, amount, timeRange, customerId, timeToStart } = req.body;
    const token = req.headers.authorization;
    const supplierId = req.user.userId;
    const reviewCheck = await axios.get(
      `${process.env.ORDER_SERVICE_URL}/api/orders/supplier/${supplierId}/pending-review`,
      { headers: { Authorization: token } },
    );

    if (reviewCheck.data.hasPendingReview) {
      return res.status(403).json({
        reviewRequired: true,
        order: reviewCheck.data.order,
        message:
          "You must review your last completed job before creating a new offer.",
      });
    }

    const activeJob = await Offer.findOne({
      supplierId,
      status: { $in: ["pending", "accepted"] },
      orderId: { $ne: orderId },
    });

    if (activeJob) {
      return res.status(400).json({
        message: "You already have an active offer or job",
      });
    }

    const existingOffer = await Offer.findOne({
      supplierId,
      orderId,
      status: { $in: ["pending", "rejected", "expired"] },
    });

    const expiresAt = type === "price" ? new Date(Date.now() + 3 * 60 * 1000) : null;

    if (existingOffer) {
      existingOffer.type = type;
      existingOffer.amount = amount;
      existingOffer.timeRange = timeRange;
      existingOffer.timeToStart = timeToStart;
      existingOffer.status = "pending";
      existingOffer.expiresAt = expiresAt;

      await existingOffer.save();

      const io = getIO();
      io.to(`user_${customerId}`).emit("offer_updated", existingOffer);

      const token = req.headers.authorization;

      await sendNotification(token, {
        userId: customerId,
        type: "NEW_OFFER",
        title: "New Offer Received",
        message: `You have received a new offer for your order #${orderId}.`,
        data: {
          offerId: existingOffer._id,
          orderId,
          supplierId,
          type,
          amount,
          timeRange,
          timeToStart,
        },
      });

      return res.status(200).json({
        message: "Offer updated and resent",
        offer: existingOffer,
      });
    }

    const offer = await Offer.create({
      orderId,
      type,
      amount,
      timeRange,
      supplierId,
      expiresAt,
      timeToStart,
      status: "pending",
    });

    const io = getIO();
    io.to(`user_${customerId}`).emit("new_offer", offer);
    await sendNotification(token, {
      userId: customerId,
      type: "NEW_OFFER",
      title: "New Offer Received",
      message: `You have received a new offer for your order #${orderId}.`,
      data: {
        offerId: offer._id,
        orderId,
        supplierId,
        type,
        amount,
        timeRange,
        timeToStart,
      },
    });
    res.status(201).json({
      message: "Offer created",
      offer,
    });
  } catch (error) {
    console.error("Create offer error:", error);
    res.status(500).json({ message: "Failed to create offer" });
  }
};

export const acceptOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;
    const supplierId = req.user.userId;

    const reviewCheck = await axios.get(
      `${process.env.ORDER_SERVICE_URL}/api/orders/supplier/${supplierId}/pending-review`,
      { headers: { Authorization: token } },
    );

    if (reviewCheck.data.hasPendingReview) {
      return res.status(403).json({
        reviewRequired: true,
        order: reviewCheck.data.order,
        message:
          "You must review your last completed job before accepting a new one.",
      });
    }

    const offer = await Offer.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "accepted" },
      { new: true },
    );

    if (!offer) {
      return res.status(404).json({
        message: "Offer not found or already processed",
      });
    }

    await axios.put(
      `${process.env.ORDER_SERVICE_URL}/api/orders/${offer.orderId}/status`,
      { status: "in_progress" },
      { headers: { Authorization: token } },
    );

    await Offer.updateMany(
      { orderId: offer.orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    const orderResponse = await axios.get(
      `${process.env.ORDER_SERVICE_URL}/api/orders/${offer.orderId}`,
      { headers: { Authorization: token } },
    );

    const order = orderResponse.data;

    await axios.post(
      `${process.env.SESSION_SERVICE_URL}/api/sessions`,
      {
        orderId: offer.orderId,
        offerId: offer._id,
        customerId: order.customerId,
        supplierId: offer.supplierId,
      },
      { headers: { Authorization: token } },
    );

    const io = getIO();
    io.to(`user_${offer.supplierId}`).emit("offer_accepted", offer);

    await sendNotification(token, {
      userId: offer.supplierId.toString(),
      type: "OFFER_ACCEPTED",
      title: "Offer Accepted",
      message: `Your offer for order #${offer.orderId} has been accepted by the ${order.customerName}.`,
      data: {
        offerId: offer._id,
        orderId: offer.orderId,
        customerId: order.customerId,
      },
    });

    res.json({
      message: "Offer accepted and session created",
      offer,
    });
  } catch (error) {
    console.error("Accept offer error:", error);
    res.status(500).json({ message: "Failed to accept offer" });
  }
};

export const rejectOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "rejected" },
      { new: true },
    );

    if (!offer) {
      return res.status(404).json({ message: "Offer not found" });
    }

    const io = getIO();
    io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
      orderId: offer.orderId,
    });
    const token = req.headers.authorization;
    await sendNotification(token, {
      userId: offer.supplierId.toString(),
      type: "OFFER_REJECTED",
      title: "Offer Rejected",
      message: `Your offer for order #${offer.orderId} has been rejected`,
      data: {
        offerId: offer._id,
        orderId: offer.orderId,
      },
    });
    res.json({ message: "Offer rejected", offer });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject offer" });
  }
};

export const getOffersByOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    await Offer.updateMany(
      {
        orderId,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      { status: "expired" },
    );

    const offers = await Offer.find({
      orderId,
      status: "pending",
    }).sort({ createdAt: -1 });
    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        try {
          const token = req.headers.authorization;
          const userResponse = await axios.get(
            `${process.env.AUTH_SERVICE_URL}/api/auth/${offer.supplierId}`,
            {
              headers: {
                Authorization: token,
              },
            },
          );

          return {
            ...offer.toObject(),
            supplier: userResponse.data,
          };
        } catch (err) {
          console.error("Failed to fetch supplier:", err);
          return offer;
        }
      }),
    );

    res.json({ offers: enrichedOffers });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch offers" });
  }
};

export const checkActiveOffer = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;

    const activeOffer = await Offer.findOne({
      supplierId,
      status: { $in: ["pending", "accepted"] },
    }).sort({ createdAt: -1 });

    if (!activeOffer) {
      return res.json({
        hasActiveOffer: false,
        activeOffer: null,
      });
    }

    res.json({
      hasActiveOffer: true,
      activeOffer,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to check active offer" });
  }
};

export const rejectOffersByOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const offers = await Offer.find({
      orderId,
      status: "pending",
    });

    const io = getIO();

    for (const offer of offers) {
      io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
        orderId,
        reason: "Order deleted by customer",
      });
    }

    await Offer.updateMany(
      { orderId, status: "pending" },
      { status: "rejected" },
    );

    res.json({
      message: "All offers rejected (not deleted)",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject offers" });
  }
};

export const acceptOrderDirect = async (req: any, res: Response) => {
  try {
    const { orderId } = req.params;
    const supplierId = req.user.userId;
    const token = req.headers.authorization;

    const existingActive = await Offer.findOne({
      supplierId,
      status: { $in: ["pending", "accepted"] },
    });

    if (existingActive) {
      return res.status(400).json({
        message: "You already have an active job or offer",
      });
    }

    let lockedOrder;

    try {
      const lockResponse = await axios.put(
        `${process.env.ORDER_SERVICE_URL}/api/orders/${orderId}/lock-and-start`,
        {},
        { headers: { Authorization: token } },
      );

      lockedOrder = lockResponse.data;
    } catch {
      return res.status(400).json({
        message: "Order already taken",
      });
    }

    const offer = await Offer.create({
      orderId,
      supplierId,
      type: "price",
      amount: lockedOrder.requestedPrice,
      status: "accepted",
    });

    await Offer.updateMany(
      { orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    await axios.post(
      `${process.env.SESSION_SERVICE_URL}/api/sessions`,
      {
        orderId,
        offerId: offer._id,
        customerId: lockedOrder.customerId,
        supplierId,
      },
      { headers: { Authorization: token } },
    );

    const io = getIO();
    io.to(`user_${lockedOrder.customerId}`).emit("order_accepted_direct", {
      orderId,
      supplierId,
    });

    await sendNotification(token, {
      userId: lockedOrder.customerId.toString(),
      type: "ORDER_ACCEPTED_DIRECT",
      title: "Order Accepted",
      message: `Your order #${orderId} has been accepted directly by a supplier.`,
      data: {
        orderId,
        supplierId,
        offerId: offer._id,
      },
    });

    res.json({
      message: "Order accepted successfully",
      offer,
    });
  } catch (error) {
    console.error("Direct accept error:", error);
    res.status(500).json({ message: "Failed to accept order" });
  }
};
