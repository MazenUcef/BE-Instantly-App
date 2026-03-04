import { Request, Response } from "express";
import UserModel from "../../auth/models/User.model";
import { getIO } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import OrderModel from "../../order/models/Order.model";
import sessionModel from "../../session/models/session.model";
import OfferModel from "../models/Offer.model";

export const createOffer = async (req: any, res: Response) => {
  try {
    const { orderId, type, amount, timeRange, customerId, timeToStart } =
      req.body;
    const token = req.headers.authorization;
    const supplierId = req.user.userId;

    const orderWithPendingReview = await OrderModel.findOne({
      supplierId,
      status: "completed",
      supplierReviewed: false,
    }).sort({ updatedAt: -1 });

    if (orderWithPendingReview) {
      const session = await sessionModel.findOne({
        orderId: orderWithPendingReview._id,
      });

      let supplierData = null;
      if (session) {
        supplierData = await UserModel.findById(session.supplierId).select(
          "-password",
        );
      }

      return res.status(403).json({
        reviewRequired: true,
        order: {
          ...orderWithPendingReview.toObject(),
          supplier: supplierData,
        },
        message:
          "You must review your last completed job before creating a new offer.",
      });
    }

    const activeJob = await OfferModel.findOne({
      supplierId,
      status: { $in: ["pending", "accepted"] },
      orderId: { $ne: orderId },
    });

    if (activeJob) {
      return res.status(400).json({
        message: "You already have an active offer or job",
      });
    }

    const existingOffer = await OfferModel.findOne({
      supplierId,
      orderId,
      status: { $in: ["pending", "rejected", "expired"] },
    });

    const expiresAt =
      type === "price" ? new Date(Date.now() + 3 * 60 * 1000) : null;

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

      await publishNotification({
        userId: customerId,
        type: "NEW_OFFER",
        title: "New Offer Received",
        message: `You have received a new offer for your order #${orderId}.`,
        data: {
          offerId: existingOffer._id.toString(),
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

    const offer = await OfferModel.create({
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

    await publishNotification({
      userId: customerId,
      type: "NEW_OFFER",
      title: "New Offer Received",
      message: `You have received a new offer for your order #${orderId}.`,
      data: {
        offerId: offer._id.toString(),
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
    const supplierId = req.user.userId;

    const offer = await OfferModel.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "accepted" },
      { new: true },
    );

    if (!offer) {
      return res.status(404).json({
        message: "Offer not found or already processed",
      });
    }

    await OrderModel.findByIdAndUpdate(offer.orderId, {
      status: "in_progress",
    });

    await OfferModel.updateMany(
      { orderId: offer.orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    const order = await OrderModel.findById(offer.orderId);
    if (order) {
      await sessionModel.create({
        orderId: offer.orderId,
        offerId: offer._id,
        customerId: order.customerId,
        supplierId: offer.supplierId,
      });
    }

    const io = getIO();
    io.to(`user_${offer.supplierId}`).emit("offer_accepted", offer);

    await publishNotification({
      userId: offer.supplierId.toString(),
      type: "OFFER_ACCEPTED",
      title: "Offer Accepted",
      message: `Your offer for order #${offer.orderId} has been accepted.`,
      data: {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
        customerId: order?.customerId.toString(),
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

    const offer = await OfferModel.findOneAndUpdate(
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
    await publishNotification({
      userId: offer.supplierId.toString(),
      type: "OFFER_REJECTED",
      title: "Offer Rejected",
      message: `Your offer for order #${offer.orderId} has been rejected`,
      data: {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
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

    await OfferModel.updateMany(
      {
        orderId,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      { status: "expired" },
    );

    const offers = await OfferModel.find({
      orderId,
      status: "pending",
    }).sort({ createdAt: -1 });

    res.json({ offers });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch offers" });
  }
};

export const checkActiveOffer = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;

    const activeOffer = await OfferModel.findOne({
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

    const offers = await OfferModel.find({
      orderId,
      status: "pending",
    });

    const io = getIO();

    for (const offer of offers) {
      io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
        orderId,
        reason: "Order deleted by customer",
      });
      await publishNotification({
        userId: offer.supplierId.toString(),
        type: "OFFER_REJECTED",
        title: "Offer Rejected",
        message: `Your offer for order #${orderId} has been rejected because the order was deleted.`,
        data: {
          offerId: offer._id.toString(),
          orderId,
        },
      });
    }

    await OfferModel.updateMany(
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

    const existingActive = await OfferModel.findOne({
      supplierId,
      status: { $in: ["pending", "accepted"] },
    });

    if (existingActive) {
      return res.status(400).json({
        message: "You already have an active job or offer",
      });
    }

    const order = await OrderModel.findById(orderId);

    if (!order || order.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Order already taken or not found" });
    }

    order.status = "in_progress";
    await order.save();

    const offer = await OfferModel.create({
      orderId,
      supplierId,
      type: "price",
      amount: order.requestedPrice,
      status: "accepted",
    });

    await OfferModel.updateMany(
      { orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    await sessionModel.create({
      orderId,
      offerId: offer._id,
      customerId: order.customerId,
      supplierId,
    });

    const io = getIO();
    io.to(`user_${order.customerId}`).emit("order_accepted_direct", {
      orderId,
      supplierId,
    });

    await publishNotification({
      userId: order.customerId.toString(),
      type: "ORDER_ACCEPTED_DIRECT",
      title: "Order Accepted",
      message: `Your order #${orderId} has been accepted directly by a supplier.`,
      data: {
        orderId,
        supplierId: supplierId.toString(),
        offerId: offer._id.toString(),
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
