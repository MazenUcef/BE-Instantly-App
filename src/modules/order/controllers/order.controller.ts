import { Request, Response } from "express";
import Order from "../models/Order.model";
import sessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { publishNotification } from "../../notification/notification.publisher";
import OfferModel from "../../offer/models/Offer.model";
import GovernmentModel from "../../government/models/Government.model";
import CategoryModel from "../../category/models/Category.model";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import {
  getIO,
  socketRooms,
  socketEvents,
} from "../../../shared/config/socket";

export const createOrder = async (req: any, res: Response) => {
  try {
    const {
      address,
      description,
      categoryId,
      governmentId,
      requestedPrice,
      timeToStart,
      jobTitle,
    } = req.body;
    const { userId, name } = req.user;

    if (!requestedPrice || requestedPrice <= 0) {
      return res.status(400).json({ message: "Price is required" });
    }

    if (!governmentId) {
      return res.status(400).json({ message: "Government is required" });
    }

    if (!jobTitle) {
      return res.status(400).json({ message: "Job title is required" });
    }

    const government = await GovernmentModel.findById(governmentId);
    if (!government) {
      return res.status(400).json({ message: "Invalid government" });
    }

    const category = await CategoryModel.findById(categoryId);
    if (!category) {
      return res.status(400).json({ message: "Invalid category" });
    }

    if (!category.jobs || !category.jobs.includes(jobTitle)) {
      return res.status(400).json({
        message: "Invalid job title for this category",
        availableJobTitles: category.jobs,
      });
    }

    const existingOrder = await Order.findOne({
      customerId: userId,
      status: { $in: ["pending", "in_progress"] },
    });

    if (existingOrder) {
      return res.status(400).json({
        message:
          "You already have an active order. Please complete it before creating a new one.",
      });
    }

    const unfinishedReview = await Order.findOne({
      customerId: userId,
      status: "completed",
      customerReviewed: false,
    }).sort({ createdAt: -1 });

    if (unfinishedReview) {
      return res.status(403).json({
        message: "You have to review and rate your last order",
        reviewRequired: true,
        order: unfinishedReview,
      });
    }

    const order = await Order.create({
      customerId: userId,
      customerName: name,
      address,
      description,
      categoryId: categoryId,
      governmentId: governmentId,
      jobTitle,
      requestedPrice,
      timeToStart,
      status: "pending",
    });

    const supplierOrderPayload = await buildSupplierOrderPayload(
      order._id.toString(),
    );

    if (!supplierOrderPayload) {
      return res.status(500).json({ message: "Failed to build order payload" });
    }

    const io = getIO();
    const room = socketRooms.supplierOrders(
      categoryId.toString(),
      governmentId.toString(),
    );

    io.to(room).emit(socketEvents.ORDER_NEW, supplierOrderPayload);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: {
        ...supplierOrderPayload,
        selectedJobTitle: jobTitle,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

export const updateOrderPrice = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { requestedPrice } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customerId !== req.user.userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ message: "Cannot update price now" });
    }

    order.requestedPrice = requestedPrice;
    await order.save();

    const supplierOrderPayload = await buildSupplierOrderPayload(
      order._id.toString(),
    );

    if (!supplierOrderPayload) {
      return res.status(500).json({ message: "Failed to build order payload" });
    }

    const io = getIO();
    const room = socketRooms.supplierOrders(
      order.categoryId.toString(),
      order.governmentId.toString(),
    );

    io.to(room).emit(socketEvents.ORDER_UPDATED, supplierOrderPayload);

    return res.json({
      message: "Price updated",
      order: supplierOrderPayload,
    });
  } catch (error) {
    console.error("Update order price error:", error);
    res.status(500).json({ message: "Failed to update price" });
  }
};

export const deleteOrder = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customerId !== req.user.userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const pendingOffers = await OfferModel.find({
      orderId: order._id,
      status: "pending",
    });

    const io = getIO();

    for (const offer of pendingOffers) {
      io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
        orderId: order._id,
        reason: "Order deleted by customer",
      });

      await publishNotification({
        userId: offer.supplierId.toString(),
        type: "OFFER_REJECTED",
        title: "Offer Rejected",
        message: `Your offer for order #${order._id} has been rejected because the order was deleted.`,
        data: {
          offerId: offer._id.toString(),
          orderId: order._id.toString(),
        },
      });
    }

    await OfferModel.updateMany(
      { orderId: order._id, status: "pending" },
      { status: "rejected" },
    );

    await order.deleteOne();

    const room = socketRooms.supplierOrders(
      order.categoryId.toString(),
      order.governmentId.toString(),
    );

    io.to(room).emit(socketEvents.ORDER_DELETED, {
      orderId: order._id.toString(),
    });

    res.json({ message: "Order deleted and offers rejected" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};

export const getActiveOrdersByCategory = async (req: any, res: Response) => {
  try {
    const supplierCategoryId = req.user.categoryId;
    const supplierGovernmentIds = req.user.governmentIds || [];
    const userId = req.user.userId;

    if (!supplierGovernmentIds || supplierGovernmentIds.length === 0) {
      return res.json({
        message: "No active orders for now",
        ordersWithOffers: [],
        availableOrders: [],
        count: {
          ordersWithOffers: 0,
          availableOrders: 0,
        },
      });
    }

    // Check if supplier already has an accepted offer (active job)
    const activeAcceptedOffer = await OfferModel.findOne({
      supplierId: userId,
      status: "accepted",
    }).sort({ createdAt: -1 });

    if (activeAcceptedOffer) {
      const activeOrder = await buildSupplierOrderPayload(
        activeAcceptedOffer.orderId.toString(),
      );

      if (!activeOrder) {
        return res.status(404).json({
          message: "Active order not found",
        });
      }

      return res.json({
        type: "active_job",
        order: activeOrder,
        activeAcceptedOffer: true,
      });
    }

    // Get all pending orders that match supplier's category and government
    const allPendingOrders = await Order.find({
      categoryId: supplierCategoryId,
      governmentId: { $in: supplierGovernmentIds },
      status: "pending",
      customerId: { $ne: userId },
    }).sort({ createdAt: -1 });

    // Get all pending offers from this supplier
    const supplierPendingOffers = await OfferModel.find({
      supplierId: userId,
      status: "pending",
    }).select("orderId");

    const orderIdsWithOffers = supplierPendingOffers.map((offer) =>
      offer.orderId.toString(),
    );

    // Separate orders into two arrays
    const ordersWithOffers: any[] = [];
    const availableOrders: any[] = [];

    for (const order of allPendingOrders) {
      const enrichedOrder = await buildSupplierOrderPayload(
        order._id.toString(),
      );
      if (enrichedOrder) {
        if (orderIdsWithOffers.includes(order._id.toString())) {
          ordersWithOffers.push(enrichedOrder);
        } else {
          availableOrders.push(enrichedOrder);
        }
      }
    }

    return res.json({
      type: "orders_list",
      ordersWithOffers,
      availableOrders,
      count: {
        ordersWithOffers: ordersWithOffers.length,
        availableOrders: availableOrders.length,
        total: ordersWithOffers.length + availableOrders.length,
      },
    });
  } catch (error) {
    console.log("Get active orders error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const getOrderDetails = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role === "supplier") {
      if (
        order.categoryId !== req.user.categoryId ||
        order.customerId === req.user.userId
      ) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    if (req.user.role === "customer") {
      if (order.customerId !== req.user.userId) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch order details" });
  }
};

export const getCustomerOrderHistory = async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    const orders = await Order.find({ customerId: userId }).sort({
      createdAt: -1,
    });

    res.json({
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.log("Get customer order history error:", error);
    res.status(500).json({ message: "Failed to fetch order history" });
  }
};

export const checkPendingOrders = async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    const activeOrder = await Order.findOne({
      customerId: userId,
      status: { $in: ["pending", "in_progress"] },
    }).sort({ createdAt: -1 });

    if (activeOrder) {
      return res.json({
        hasPendingOrders: true,
        pendingOrder: activeOrder,
        status: activeOrder.status,
        message: "You have an active order",
      });
    }

    const pendingReviewOrder = await Order.findOne({
      customerId: userId,
      status: "completed",
      customerReviewed: false,
    }).sort({ createdAt: -1 });

    if (pendingReviewOrder) {
      const session = await sessionModel.findOne({
        orderId: pendingReviewOrder._id,
      });

      let supplierData = null;
      if (session) {
        supplierData = await UserModel.findById(session.supplierId).select(
          "-password -refreshToken -biometrics",
        );
      }

      return res.json({
        hasPendingOrders: true,
        reviewRequired: true,
        pendingOrder: pendingReviewOrder,
        supplier: supplierData,
        message: "You have a completed order that needs review",
      });
    }

    const anyPendingOrder = await Order.findOne({
      customerId: userId,
      status: "pending",
    }).sort({ createdAt: -1 });

    if (anyPendingOrder) {
      return res.json({
        hasPendingOrders: true,
        pendingOrder: anyPendingOrder,
        status: "pending",
        message: "You have a pending order",
      });
    }

    return res.json({
      hasPendingOrders: false,
      message: "No pending orders found",
    });
  } catch (error) {
    console.error("Check pending orders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check pending orders",
    });
  }
};
