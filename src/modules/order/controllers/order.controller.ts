import { Request, Response } from "express";
import Order from "../models/Order.model";
import { getIO } from "../../../shared/config/socket";
import sessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { publishNotification } from "../../notification/notification.publisher";
import OfferModel from "../../offer/models/Offer.model";

export const createOrder = async (req: any, res: Response) => {
  try {
    const { address, description, categoryId, requestedPrice, timeToStart } =
      req.body;
    const { userId, name } = req.user;

    if (!requestedPrice || requestedPrice <= 0) {
      return res.status(400).json({ message: "Price is required" });
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
      try {
        const session = await sessionModel.findOne({
          orderId: unfinishedReview._id,
        });

        let supplierData = null;
        if (session) {
          supplierData = await UserModel.findById(session.supplierId).select(
            "-password",
          );
        }

        return res.status(403).json({
          message: "You have to review and rate your last order",
          reviewRequired: true,
          order: {
            ...unfinishedReview.toObject(),
            supplier: supplierData,
          },
        });
      } catch (error) {
        console.log("error", error);
        return res.status(403).json({
          reviewRequired: true,
          order: unfinishedReview,
        });
      }
    }

    const order = await Order.create({
      customerId: userId,
      customerName: name,
      address,
      description,
      categoryId,
      requestedPrice,
      timeToStart,
      status: "pending",
    });

    const io = getIO();
    io.to(`category_${categoryId}`).emit("new_order", order);

    res.status(201).json(order);
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

    if (order.customerId !== req.user.userId)
      return res.status(403).json({ message: "Not allowed" });

    if (order.status !== "pending")
      return res.status(400).json({ message: "Cannot update price now" });

    order.requestedPrice = requestedPrice;
    await order.save();

    const io = getIO();
    io.to(`category_${order.categoryId}`).emit("order_price_updated", order);

    res.json({ message: "Price updated", order });
  } catch (error) {
    console.error("Update order price error:", error);
    res.status(500).json({ message: "Failed to update price" });
  }
};

export const deleteOrder = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customerId !== req.user.userId)
      return res.status(403).json({ message: "Not allowed" });

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

    res.json({ message: "Order deleted and offers rejected" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};

export const getActiveOrdersByCategory = async (req: any, res: Response) => {
  try {
    const supplierCategoryId = req.user.categoryId;
    const userId = req.user.userId;

    const activeOffer = await OfferModel.findOne({
      supplierId: userId,
      status: { $in: ["pending", "accepted"] },
    }).sort({ createdAt: -1 });

    if (activeOffer) {
      const activeOrder = await Order.findById(activeOffer.orderId);

      if (!activeOrder) {
        return res.status(404).json({
          message: "Active order not found",
        });
      }

      return res.json({
        type: "active_job",
        order: activeOrder,
      });
    }

    const orders = await Order.find({
      categoryId: supplierCategoryId,
      status: "pending",
      customerId: { $ne: userId },
    }).sort({ createdAt: -1 });

    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          const customer = await UserModel.findById(order.customerId).select(
            "-password",
          );
          return {
            ...order.toObject(),
            customer: customer || null,
          };
        } catch (err) {
          console.error("Failed to fetch customer:", err);
          return order;
        }
      }),
    );

    return res.json({
      type: "available_orders",
      count: orders.length,
      orders: enrichedOrders,
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

export const updateOrderStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status, price } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const previousStatus = order.status;
    order.status = status;

    if (status === "completed") {
      order.finalPrice = price ?? order.finalPrice;
      order.customerReviewed = false;
      order.supplierReviewed = false;
    }

    await order.save();

    const session = await sessionModel.findOne({ orderId: order._id });

    if (session) {
      await publishNotification({
        userId: order.customerId.toString(),
        type: "ORDER_STATUS_UPDATED",
        title: "Order Status Updated",
        message: `Your order #${order._id} status has been updated to ${status}.`,
        data: {
          orderId: order._id.toString(),
          previousStatus,
          newStatus: status,
        },
      });

      if (session.supplierId) {
        await publishNotification({
          userId: session.supplierId.toString(),
          type: "ORDER_STATUS_UPDATED",
          title: "Order Status Updated",
          message: `Order #${order._id} status has been updated to ${status}.`,
          data: {
            orderId: order._id.toString(),
            previousStatus,
            newStatus: status,
          },
        });
      }
    }

    const io = getIO();
    io.to(`category_${order.categoryId}`).emit("order_status_updated", {
      orderId: order._id,
      status,
    });

    res.json({
      message: `Order status updated to ${status}`,
      order,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ message: "Failed to update order status" });
  }
};

export const markOrderReviewed = async (req: any, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (role === "customer") {
    order.customerReviewed = true;
  }

  if (role === "supplier") {
    order.supplierReviewed = true;
  }

  await order.save();

  res.json({ message: "Review status updated", order });
};

export const lockAndStartOrder = async (req: any, res: Response) => {
  const { id } = req.params;

  const order = await Order.findOneAndUpdate(
    { _id: id, status: "pending" },
    { status: "in_progress" },
    { new: true },
  );

  if (!order) {
    return res.status(400).json({
      message: "Order already taken",
    });
  }

  res.json(order);
};

export const getPendingReviewBySupplier = async (
  req: Request,
  res: Response,
) => {
  try {
    const { supplierId } = req.params;

    const order = await Order.findOne({
      supplierId,
      status: "completed",
      supplierReviewed: false,
    }).sort({ updatedAt: -1 });

    if (!order) {
      return res.json({
        hasPendingReview: false,
        order: null,
      });
    }

    const customer = await UserModel.findById(order.customerId).select("-password");
    const session = await sessionModel.findOne({ orderId: order._id });

    res.json({
      hasPendingReview: true,
      order: {
        ...order.toObject(),
        customer: customer || null,
        session: session || null,
      },
    });
  } catch (error) {
    console.error("Get pending review error:", error);
    res.status(500).json({ message: "Failed to check review status" });
  }
};
