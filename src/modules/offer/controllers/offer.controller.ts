import { Request, Response } from "express";
import UserModel from "../../auth/models/User.model";
import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import OrderModel from "../../order/models/Order.model";
import sessionModel from "../../session/models/session.model";
import OfferModel from "../models/Offer.model";
import mongoose from "mongoose";

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

    // Check if supplier already has an ACCEPTED offer (active job) - but allow multiple pending offers
    const activeAcceptedJob = await OfferModel.findOne({
      supplierId,
      status: "accepted",
    });

    if (activeAcceptedJob) {
      return res.status(400).json({
        message: "You already have an active job. Cannot create new offers.",
        activeJob: activeAcceptedJob,
      });
    }

    // Check if supplier already has a pending offer for this specific order
    const existingOffer = await OfferModel.findOne({
      supplierId,
      orderId,
      status: "pending",
    });

    const expiresAt = null;

    if (existingOffer) {
      // Update existing offer instead of creating duplicate
      existingOffer.type = type;
      existingOffer.amount = amount;
      existingOffer.timeRange = timeRange;
      existingOffer.timeToStart = timeToStart;
      existingOffer.status = "pending";
      existingOffer.expiresAt = expiresAt;

      await existingOffer.save();

      const io = getIO();
      io.to(socketRooms.user(customerId)).emit(
        socketEvents.OFFER_UPDATED,
        existingOffer,
      );

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

    // Allow creating new offer for different order
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
    io.to(socketRooms.user(customerId)).emit(socketEvents.OFFER_NEW, offer);

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
      activeOffersCount: await OfferModel.countDocuments({
        supplierId,
        status: "pending",
      }),
    });
  } catch (error) {
    console.error("Create offer error:", error);
    res.status(500).json({ message: "Failed to create offer" });
  }
};

export const acceptOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

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

    // WITHDRAW ALL ACTIVE PENDING OFFERS FROM THIS SUPPLIER
    // Find all pending offers from this supplier (excluding the accepted one)
    const supplierPendingOffers = await OfferModel.find({
      supplierId: offer.supplierId,
      status: "pending",
      _id: { $ne: offer._id },
    });

    console.log(
      `Withdrawing ${supplierPendingOffers.length} pending offers from supplier ${offer.supplierId}`,
    );

    // Withdraw all pending offers
    for (const pendingOffer of supplierPendingOffers) {
      pendingOffer.status = "rejected";
      await pendingOffer.save();

      // Notify customers about withdrawn offers
      const orderForWithdrawnOffer = await OrderModel.findById(
        pendingOffer.orderId,
      );
      if (orderForWithdrawnOffer && orderForWithdrawnOffer.customerId) {
        const io = getIO();
        io.to(
          socketRooms.user(orderForWithdrawnOffer.customerId.toString()),
        ).emit(socketEvents.OFFER_DELETED, {
          offerId: pendingOffer._id,
          orderId: pendingOffer.orderId,
          supplierId: offer.supplierId,
          message: "Supplier withdrew their offer as they accepted another job",
          acceptedOrderId: offer.orderId,
        });

        await publishNotification({
          userId: orderForWithdrawnOffer.customerId.toString(),
          type: "OFFER_WITHDRAWN",
          title: "Offer Withdrawn",
          message: `A supplier has withdrawn their offer for order #${pendingOffer.orderId} as they accepted another job.`,
          data: {
            offerId: pendingOffer._id.toString(),
            orderId: pendingOffer.orderId.toString(),
            supplierId: offer.supplierId.toString(),
            acceptedOrderId: offer.orderId.toString(),
          },
        });
      }
    }

    // Update the accepted order status
    await OrderModel.findByIdAndUpdate(offer.orderId, {
      status: "in_progress",
    });

    // Reject other offers for this specific order
    await OfferModel.updateMany(
      { orderId: offer.orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    // Create session
    let session = null;
    const order = await OrderModel.findById(offer.orderId);

    if (order) {
      session = await sessionModel.create({
        orderId: offer.orderId,
        offerId: offer._id,
        customerId: order.customerId,
        supplierId: offer.supplierId,
        status: "started",
      });

      console.log("✅ Session created:", {
        sessionId: session._id,
        orderId: offer.orderId,
        offerId: offer._id,
        customerId: order.customerId,
        supplierId: offer.supplierId,
      });
    }

    const io = getIO();

    // Notify the supplier about their accepted offer and withdrawn offers
    io.to(socketRooms.user(offer.supplierId.toString())).emit(
      socketEvents.OFFER_ACCEPTED,
      {
        ...offer.toObject(),
        sessionId: session?._id,
        withdrawnOffersCount: supplierPendingOffers.length,
        withdrawnOffers: supplierPendingOffers.map((o) => o.orderId),
      },
    );

    await publishNotification({
      userId: offer.supplierId.toString(),
      type: "OFFER_ACCEPTED",
      title: "Offer Accepted",
      message: `Your offer for order #${offer.orderId} has been accepted. ${
        supplierPendingOffers.length > 0
          ? `Your ${supplierPendingOffers.length} other active offer(s) have been automatically withdrawn.`
          : ""
      }`,
      data: {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
        customerId: order?.customerId.toString(),
        sessionId: session?._id.toString(),
        withdrawnOffersCount: supplierPendingOffers.length,
        withdrawnOrderIds: supplierPendingOffers.map((o) =>
          o.orderId.toString(),
        ),
      },
    });

    res.json({
      message: "Offer accepted and session created",
      offer,
      withdrawnOffers: {
        count: supplierPendingOffers.length,
        orders: supplierPendingOffers.map((o) => o.orderId),
      },
      session: session
        ? {
            _id: session._id,
            orderId: session.orderId,
            offerId: session.offerId,
            customerId: session.customerId,
            supplierId: session.supplierId,
            status: session.status,
          }
        : null,
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
    io.to(socketRooms.user(offer.supplierId.toString())).emit(
      socketEvents.OFFER_REJECTED,
      {
        orderId: offer.orderId,
      },
    );
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

    const offers = await OfferModel.find({
      orderId,
      status: "pending",
    }).sort({ createdAt: -1 });

    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        try {
          const supplier = await UserModel.findById(offer.supplierId).select(
            "-password -refreshToken -biometrics"
          );
          
          return {
            ...offer.toObject(),
            supplier: supplier || null,
          };
        } catch (err) {
          console.error("Failed to fetch supplier details:", err);
          return offer;
        }
      })
    );

    res.json({ offers: enrichedOffers });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch offers" });
  }
};

export const acceptOrderDirect = async (req: any, res: Response) => {
  try {
    const { orderId } = req.params;
    const supplierId = req.user.userId;

    // Check if supplier already has an accepted offer (active job)
    const existingAccepted = await OfferModel.findOne({
      supplierId,
      status: "accepted",
    });

    if (existingAccepted) {
      return res.status(400).json({
        message: "You already have an active job",
        activeJob: existingAccepted,
      });
    }

    const order = await OrderModel.findById(orderId);

    if (!order || order.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Order already taken or not found" });
    }

    // Get all pending offers from this supplier BEFORE creating the new accepted offer
    const supplierPendingOffers = await OfferModel.find({
      supplierId,
      status: "pending",
    });

    console.log(
      `Found ${supplierPendingOffers.length} pending offers to withdraw`,
    );

    // Create the accepted offer
    const offer = await OfferModel.create({
      orderId,
      supplierId,
      type: "price",
      amount: order.requestedPrice,
      status: "accepted",
    });

    // Update order status
    order.status = "in_progress";
    await order.save();

    // WITHDRAW ALL PENDING OFFERS (excluding the one we just created, but it's not pending anyway)
    for (const pendingOffer of supplierPendingOffers) {
      pendingOffer.status = "rejected";
      await pendingOffer.save();

      // Notify customers about withdrawn offers
      const orderForWithdrawnOffer = await OrderModel.findById(
        pendingOffer.orderId,
      );
      if (orderForWithdrawnOffer && orderForWithdrawnOffer.customerId) {
        const io = getIO();
        io.to(
          socketRooms.user(orderForWithdrawnOffer.customerId.toString()),
        ).emit(socketEvents.OFFER_DELETED, {
          offerId: pendingOffer._id,
          orderId: pendingOffer.orderId,
          supplierId: supplierId,
          message: "Supplier withdrew their offer as they accepted another job",
          acceptedOrderId: orderId,
        });

        await publishNotification({
          userId: orderForWithdrawnOffer.customerId.toString(),
          type: "OFFER_WITHDRAWN",
          title: "Offer Withdrawn",
          message: `A supplier has withdrawn their offer for order #${pendingOffer.orderId} as they accepted another job.`,
          data: {
            offerId: pendingOffer._id.toString(),
            orderId: pendingOffer.orderId.toString(),
            supplierId: supplierId.toString(),
            acceptedOrderId: orderId,
          },
        });
      }
    }

    // Reject other offers for this specific order
    await OfferModel.updateMany(
      { orderId, _id: { $ne: offer._id } },
      { status: "rejected" },
    );

    // Create session
    const session = await sessionModel.create({
      orderId,
      offerId: offer._id,
      customerId: order.customerId,
      supplierId,
      status: "started",
    });

    console.log("✅ Session created via direct accept:", {
      sessionId: session._id,
      orderId,
      offerId: offer._id,
      customerId: order.customerId,
      supplierId,
    });

    const io = getIO();

    // Notify the customer
    io.to(socketRooms.user(order.customerId.toString())).emit(
      socketEvents.ORDER_ACCEPTED_DIRECT,
      {
        orderId,
        supplierId,
        sessionId: session._id,
        withdrawnOffersCount: supplierPendingOffers.length,
      },
    );

    await publishNotification({
      userId: order.customerId.toString(),
      type: "ORDER_ACCEPTED_DIRECT",
      title: "Order Accepted",
      message: `Your order #${orderId} has been accepted directly by a supplier.`,
      data: {
        orderId,
        supplierId: supplierId.toString(),
        offerId: offer._id.toString(),
        sessionId: session._id.toString(),
      },
    });

    // Notify the supplier about withdrawn offers
    if (supplierPendingOffers.length > 0) {
      await publishNotification({
        userId: supplierId,
        type: "OFFERS_WITHDRAWN",
        title: "Active Offers Withdrawn",
        message: `You accepted order #${orderId}. Your ${supplierPendingOffers.length} other active offer(s) have been automatically withdrawn.`,
        data: {
          acceptedOrderId: orderId,
          withdrawnOffersCount: supplierPendingOffers.length,
          withdrawnOrderIds: supplierPendingOffers.map((o) =>
            o.orderId.toString(),
          ),
          offerId: offer._id.toString(),
        },
      });

      // Also emit socket event to supplier
      io.to(socketRooms.user(supplierId.toString())).emit("OFFERS_WITHDRAWN", {
        acceptedOrderId: orderId,
        withdrawnOffersCount: supplierPendingOffers.length,
        withdrawnOrderIds: supplierPendingOffers.map((o) => o.orderId),
      });
    }

    res.json({
      message: "Order accepted successfully",
      offer: {
        ...offer.toObject(),
        sessionId: session._id,
      },
      withdrawnOffers: {
        count: supplierPendingOffers.length,
        orders: supplierPendingOffers.map((o) => o.orderId),
      },
      session: {
        _id: session._id,
        orderId: session.orderId,
        offerId: session.offerId,
        customerId: session.customerId,
        supplierId: session.supplierId,
        status: session.status,
      },
      order: {
        _id: order._id,
        status: order.status,
        customerId: order.customerId,
      },
    });
  } catch (error) {
    console.error("Direct accept error:", error);
    res.status(500).json({ message: "Failed to accept order" });
  }
};

export const getAcceptedOfferHistory = async (req: any, res: Response) => {
  try {
    const supplierId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {
      supplierId,
      status: "accepted",
    };

    if (status) {
      filter.orderStatus = status;
    }

    const total = await OfferModel.countDocuments(filter);

    const offers = await OfferModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        try {
          const order = await OrderModel.findById(offer.orderId);
          const session = await sessionModel.findOne({ offerId: offer._id });

          let customer = null;
          if (order) {
            customer = await UserModel.findById(order.customerId).select(
              "-password -refreshToken -biometrics",
            );
          }

          return {
            ...offer.toObject(),
            order: order || null,
            session: session || null,
            customer: customer || null,
          };
        } catch (err) {
          console.error("Failed to fetch offer details:", err);
          return offer;
        }
      }),
    );

    const stats = {
      totalEarnings: await calculateTotalEarnings(supplierId),
      completedJobs: await OfferModel.countDocuments({
        supplierId,
        status: "accepted",
        orderStatus: "completed",
      }),
      inProgressJobs: await OfferModel.countDocuments({
        supplierId,
        status: "accepted",
        orderStatus: "in_progress",
      }),
    };

    res.json({
      success: true,
      data: {
        offers: enrichedOffers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Get accepted offer history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch offer history",
    });
  }
};

const calculateTotalEarnings = async (supplierId: string) => {
  try {
    const completedOffers = await OfferModel.aggregate([
      {
        $match: {
          supplierId: new mongoose.Types.ObjectId(supplierId),
          status: "accepted",
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      {
        $unwind: "$order",
      },
      {
        $match: {
          "order.status": "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    return completedOffers.length > 0 ? completedOffers[0].total : 0;
  } catch (error) {
    console.error("Calculate total earnings error:", error);
    return 0;
  }
};

export const deleteOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const supplierId = req.user.userId;

    const offer = await OfferModel.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (offer.supplierId.toString() !== supplierId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this offer",
      });
    }

    const order = await OrderModel.findById(offer.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Associated order not found",
      });
    }

    if (order.status !== "pending" && order.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: `Cannot delete offer when order is ${order.status}`,
      });
    }

    const session = await sessionModel.findOne({ offerId: offer._id });
    if (session && session.status !== "cancelled") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete offer with active session. Please cancel the session first.",
      });
    }

    const offerDetails = {
      id: offer._id.toString(),
      orderId: offer.orderId.toString(),
      amount: offer.amount,
      status: offer.status,
    };

    await offer.deleteOne();

    if (offerDetails.status === "pending") {
      const io = getIO();
      io.to(socketRooms.user(order.customerId.toString())).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: offerDetails.id,
          orderId: offerDetails.orderId,
          message: "A supplier has withdrawn their offer",
        },
      );

      await publishNotification({
        userId: order.customerId.toString(),
        type: "OFFER_DELETED",
        title: "Offer Withdrawn",
        message: `A supplier has withdrawn their offer of $${offerDetails.amount} for your order #${offerDetails.orderId}.`,
        data: {
          offerId: offerDetails.id,
          orderId: offerDetails.orderId,
        },
      });
    }

    if (offerDetails.status === "accepted") {
      await OrderModel.findByIdAndUpdate(offer.orderId, {
        status: "pending",
      });

      await publishNotification({
        userId: order.customerId.toString(),
        type: "ORDER_NEEDS_SUPPLIER",
        title: "Order Needs New Supplier",
        message: `The supplier for order #${offerDetails.orderId} has withdrawn. Your order is now available for new offers.`,
        data: {
          orderId: offerDetails.orderId,
        },
      });

      const io = getIO();
      io.to(
        socketRooms.supplierOrders(
          order.categoryId.toString(),
          order.governmentId.toString(),
        ),
      ).emit(socketEvents.ORDER_AVAILABLE_AGAIN, {
        orderId: offerDetails.orderId,
        message: "A previously accepted order is now available for new offers",
      });

      await publishNotification({
        userId: supplierId,
        type: "OFFER_WITHDRAWN",
        title: "Offer Withdrawn",
        message: `You have successfully withdrawn your accepted offer for order #${offerDetails.orderId}.`,
        data: {
          offerId: offerDetails.id,
          orderId: offerDetails.orderId,
        },
      });
    }

    res.json({
      success: true,
      message:
        offerDetails.status === "accepted"
          ? "Accepted offer withdrawn successfully. Order is now available for new offers."
          : "Offer deleted successfully",
      data: {
        deletedOfferId: offerDetails.id,
        orderId: offerDetails.orderId,
        orderStatus: order.status === "in_progress" ? "in_progress" : "pending",
      },
    });
  } catch (error) {
    console.error("Delete offer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete offer",
    });
  }
};
